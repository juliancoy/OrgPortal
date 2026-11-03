import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { CHAT_ENCRYPTION_MODES, MAX_CHAT_ENCRYPTION_DEVICES, chatDeviceId, decodeChatBytes, validateChatEnvelope, type ChatDeviceKey, type ChatEncryptionMode, type ChatSecurity } from '../../shared/chatEncryption'

type Room = { id: string; kind: string; org_id: string | null; event_id: string | null; encryption_mode?: ChatEncryptionMode; encryption_revision?: number }
type Member = { user_id: string; role: string; state: string; accepted_security_revision?: number }
type DeviceRow = { user_id: string; device_id: string; rsa_jwk: string; kem_public: string }
type Dependencies = {
  requireMember(env: Env, room: string, user: string): Promise<{ role: string }>
  conversation(db: D1Database, room: string): Promise<Room>
  organizationRole(env: Env, org: string, user: string): Promise<string | null>
  broadcast(env: Env, room: string, event: unknown): Promise<void>
}
function fail(status: 400 | 403 | 409 | 413, message: string): never { throw new HTTPException(status, { message, res: Response.json({ detail: message }, { status }) }) }

export async function boundedChatJson(request: Request, limit = 1_000_000): Promise<Record<string, unknown>> {
  if (!request.body) return {}
  const reader = request.body.getReader(), chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > limit) { await reader.cancel(); fail(413, 'Chat request is too large') }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(400, 'A JSON object is required')
    return parsed as Record<string, unknown>
  } catch { fail(400, 'Invalid chat JSON') }
}

export function modeOf(room: Room): ChatEncryptionMode {
  const mode = room.encryption_mode || 'none'
  if (!CHAT_ENCRYPTION_MODES.includes(mode)) throw new Error('Unknown chat encryption mode')
  return mode
}
export async function canManageChatSecurity(env: Env, room: Room, userId: string, role: string, deps: Dependencies): Promise<boolean> {
  const manager = (value: string | null) => !!value && ['owner', 'admin', 'administrator', 'organizer'].includes(value)
  if (room.kind === 'org_room') return !!room.org_id && manager(await deps.organizationRole(env, room.org_id, userId))
  // A public event's first commenter is not its administrator.
  if (room.kind === 'event_room') {
    const event = await env.CONTACTS_DB?.prepare('SELECT host_user_id, host_org_id FROM events WHERE id = ?')
      .bind(room.event_id).first<{ host_user_id: string | null; host_org_id: string | null }>()
    return !!event && (event.host_user_id === userId || (!!event.host_org_id && manager(await deps.organizationRole(env, event.host_org_id, userId))))
  }
  return ['owner', 'admin'].includes(role)
}

export async function chatSecuritySnapshot(env: Env, room: Room, userId: string, deps: Dependencies): Promise<ChatSecurity> {
  const actor = await deps.requireMember(env, room.id, userId)
  const memberRows = await env.DB.prepare("SELECT user_id, role, state, accepted_security_revision FROM chat_conversation_members WHERE conversation_id = ? AND state = 'active'")
    .bind(room.id).all<Member>()
  const members = [] as Member[]
  for (const member of memberRows.results || []) {
    if (room.kind !== 'org_room' || (room.org_id && await deps.organizationRole(env, room.org_id, member.user_id))) members.push(member)
  }
  const active = new Set(members.map(member => member.user_id))
  const rows = await env.DB.prepare(`SELECT k.user_id, k.device_id, k.rsa_jwk, k.kem_public
    FROM chat_device_keys k JOIN chat_conversation_members m ON m.user_id = k.user_id
    WHERE m.conversation_id = ? AND m.state = 'active' AND k.revoked_at IS NULL AND k.expires_at > ?
    ORDER BY k.user_id, k.device_id`).bind(room.id, new Date().toISOString()).all<DeviceRow>()
  const devices = (rows.results || []).filter(row => active.has(row.user_id)).map(row => ({
    user_id: row.user_id, device_id: row.device_id, rsa_jwk: JSON.parse(row.rsa_jwk) as ChatDeviceKey['rsa_jwk'], kem_public: row.kem_public,
  }))
  return { mode: modeOf(room), revision: room.encryption_revision || 0, current_user_id: userId,
    can_manage: await canManageChatSecurity(env, room, userId, actor.role, deps), devices,
    missing_acknowledgments: room.kind === 'dm' ? members.filter(member => member.accepted_security_revision !== (room.encryption_revision || 0)).map(member => member.user_id) : [],
    missing_members: members.filter(member => !devices.some(device => device.user_id === member.user_id)).map(member => member.user_id) }
}

export async function validateEncryptedChatSend(env: Env, room: Room, userId: string, clientId: string, value: unknown, deps: Dependencies) {
  const mode = modeOf(room)
  const security = await chatSecuritySnapshot(env, room, userId, deps)
  if (security.missing_acknowledgments?.length) fail(409, 'Waiting for every member to accept this chat request and security level.')
  if (mode === 'none') {
    if (value != null) fail(409, 'Chat protection changed. Refresh before sending.')
    return null
  }
  if (value == null) fail(409, 'This chat requires encrypted messages. Open it in an updated browser.')
  let envelope
  try { envelope = validateChatEnvelope(value) } catch { fail(400, 'Invalid encrypted message') }
  if (envelope.mode !== mode || envelope.revision !== (room.encryption_revision || 0) || envelope.conversation_id !== room.id ||
      envelope.sender_user_id !== userId || envelope.client_message_id !== clientId) fail(409, 'Chat protection changed or message context is invalid. Refresh before sending.')
  if (security.missing_members.length) fail(409, 'Waiting for every chat member to open this chat and register encryption keys.')
  if (security.devices.length > MAX_CHAT_ENCRYPTION_DEVICES) fail(409, 'This encrypted chat has too many active devices.')
  const expected = new Set(security.devices.map(device => `${device.user_id}:${device.device_id}`))
  if (envelope.recipients.length !== expected.size || envelope.recipients.some(recipient => !expected.has(`${recipient.user_id}:${recipient.device_id}`)) ||
      !security.devices.some(device => device.user_id === userId && device.device_id === envelope.sender_device_id)) fail(409, 'Chat device membership changed. Refresh before sending.')
  return JSON.stringify(envelope)
}

export function chatSecurityRoutes(deps: Dependencies) {
  const routes = new Hono<{ Bindings: Env; Variables: { user: { id: string } } }>()
  routes.post('/devices', async c => {
    const userId = c.get('user').id
    const payload = await boundedChatJson(c.req.raw, 12000)
    const rsa = payload.rsa_jwk as Record<string, unknown> | undefined
    if (!rsa || rsa.kty !== 'RSA' || rsa.e !== 'AQAB' || typeof rsa.n !== 'string' || ['d', 'p', 'q', 'dp', 'dq', 'qi'].some(key => key in rsa) || typeof payload.kem_public !== 'string') fail(400, 'Only public RSA and ML-KEM keys are accepted')
    let modulus: Uint8Array, kem: Uint8Array
    try { modulus = decodeChatBytes(rsa.n); kem = decodeChatBytes(payload.kem_public) } catch { fail(400, 'Invalid public key encoding') }
    if (modulus.length !== 384 || !(modulus[0] & 128) || !(modulus[383] & 1) || kem.length !== 1184) fail(400, 'RSA-3072 and ML-KEM-768 public keys are required')
    for (let i = 0; i < 1152; i += 3) if (((kem[i] | (kem[i + 1] << 8)) & 4095) >= 3329 || ((kem[i + 1] >> 4) | (kem[i + 2] << 4)) >= 3329) fail(400, 'Noncanonical ML-KEM public key')
    const publicKey: ChatDeviceKey['rsa_jwk'] = { kty: 'RSA', n: rsa.n, e: 'AQAB' }
    const deviceId = await chatDeviceId(userId, publicKey, payload.kem_public)
    if (payload.device_id !== deviceId) fail(400, 'Device key fingerprint does not match')
    const now = new Date().toISOString(), expires = new Date(Date.now() + 90 * 86400000).toISOString()
    await envCleanup(c.env, now)
    const existing = await c.env.DB.prepare('SELECT device_id FROM chat_device_keys WHERE user_id = ? AND device_id = ?').bind(userId, deviceId).first()
    const count = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM chat_device_keys WHERE user_id = ? AND expires_at > ? AND revoked_at IS NULL').bind(userId, now).first<{ count: number }>()
    if (!existing && (count?.count || 0) >= 8) fail(409, 'Remove an old browser encryption device before adding another.')
    const inserted = await c.env.DB.prepare(`INSERT INTO chat_device_keys (user_id, device_id, rsa_jwk, kem_public, created_at, last_seen_at, expires_at)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM chat_device_keys WHERE user_id=? AND device_id=?)
        OR (SELECT COUNT(*) FROM chat_device_keys WHERE user_id=? AND expires_at>? AND revoked_at IS NULL) < 8
      ON CONFLICT(user_id, device_id) DO UPDATE SET last_seen_at=excluded.last_seen_at, expires_at=excluded.expires_at`)
      .bind(userId, deviceId, JSON.stringify(publicKey), payload.kem_public, now, now, expires, userId, deviceId, userId, now).run()
    if (inserted.meta.changes !== 1) fail(409, 'Remove an old browser encryption device before adding another.')
    return c.json({ device_id: deviceId, expires_at: expires })
  })
  routes.delete('/devices/:deviceId', async c => {
    await c.env.DB.prepare('DELETE FROM chat_device_keys WHERE user_id = ? AND device_id = ?').bind(c.get('user').id, c.req.param('deviceId')).run()
    return c.json({ ok: true })
  })
  routes.get('/conversations/:conversationId/security', async c => {
    const room = await deps.conversation(c.env.DB, c.req.param('conversationId'))
    return c.json(await chatSecuritySnapshot(c.env, room, c.get('user').id, deps))
  })
  routes.post('/conversations/:conversationId/accept', async c => {
    const userId = c.get('user').id, room = await deps.conversation(c.env.DB, c.req.param('conversationId'))
    await deps.requireMember(c.env, room.id, userId)
    const payload = await boundedChatJson(c.req.raw, 1000)
    if (payload.mode !== modeOf(room) || payload.expected_revision !== (room.encryption_revision || 0)) fail(409, 'Chat protection changed. Review it before accepting.')
    const result = await c.env.DB.prepare(`UPDATE chat_conversation_members SET accepted_security_revision=?
      WHERE conversation_id=? AND user_id=? AND state='active' AND EXISTS
      (SELECT 1 FROM chat_conversations WHERE id=? AND encryption_revision=? AND encryption_mode=?)`)
      .bind(room.encryption_revision || 0, room.id, userId, room.id, room.encryption_revision || 0, modeOf(room)).run()
    if (result.meta.changes !== 1) fail(409, 'Chat protection changed. Review it before accepting.')
    const security = await chatSecuritySnapshot(c.env, room, userId, deps)
    await deps.broadcast(c.env, room.id, { type: 'conversation.security', conversation_id: room.id, mode: security.mode, revision: security.revision })
    return c.json(security)
  })
  routes.patch('/conversations/:conversationId/security', async c => {
    const userId = c.get('user').id, room = await deps.conversation(c.env.DB, c.req.param('conversationId'))
    const member = await deps.requireMember(c.env, room.id, userId)
    if (!await canManageChatSecurity(c.env, room, userId, member.role, deps)) fail(403, 'Only a current chat administrator can change encryption')
    const payload = await boundedChatJson(c.req.raw, 1000)
    if (!CHAT_ENCRYPTION_MODES.includes(payload.mode as ChatEncryptionMode) || !Number.isSafeInteger(payload.expected_revision)) fail(400, 'Encryption mode and current revision are required')
    if (payload.mode !== 'none') {
      const key = await c.env.DB.prepare('SELECT device_id FROM chat_device_keys WHERE user_id = ? AND expires_at > ? AND revoked_at IS NULL').bind(userId, new Date().toISOString()).first()
      if (!key) fail(409, 'Register this browser for encryption before enabling it.')
    }
    const result = await c.env.DB.prepare(`UPDATE chat_conversations SET encryption_mode=?, encryption_revision=encryption_revision+1, updated_at=? WHERE id=? AND encryption_revision=?`)
      .bind(payload.mode, new Date().toISOString(), room.id, payload.expected_revision).run()
    if (result.meta.changes !== 1) fail(409, 'Chat protection changed. Refresh and try again.')
    const current = await deps.conversation(c.env.DB, room.id)
    const security = await chatSecuritySnapshot(c.env, current, userId, deps)
    await deps.broadcast(c.env, room.id, { type: 'conversation.security', conversation_id: room.id, mode: security.mode, revision: security.revision })
    return c.json(security)
  })
  return routes
}

async function envCleanup(env: Env, now: string) {
  // Bounded activity-driven cleanup. Expired keys are excluded immediately even
  // on an idle deployment; no scheduled cleanup is claimed.
  await env.DB.prepare('DELETE FROM chat_device_keys WHERE rowid IN (SELECT rowid FROM chat_device_keys WHERE expires_at <= ? LIMIT 100)').bind(now).run()
}
