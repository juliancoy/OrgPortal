import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { authenticateMcp, mcpConfiguration } from './eventMcp'
import { EventIntegrationError } from './eventPlatforms'
import { enforceEventRateLimit } from './eventOperationStore'
import { validateChange, type EcosystemChange } from '../../shared/ecosystemSync'
import { NEWSLETTER_STORAGE, validateNewsletter, newsletterId, contentHash, canonicalJson } from '../../shared/newsletterStorage'

type Identity = { userId: string; resource: string; scopes: string[] }
type Payload = { changes: EcosystemChange[]; archives: Record<string, unknown>[] }
type Row = { sequence: number; change_id: string; record_id: string; replica_id: string; counter: number; deleted: number; value_json: string }
function newsletterErrorResponse(error: unknown) {
  const known = error instanceof EventIntegrationError
  return new Response(JSON.stringify({ detail: known ? error.message : 'Newsletter request failed' }), {
    status: known ? error.status : 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(known && error.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}) },
  })
}
export const decodeNewsletterRow = (row: Row): EcosystemChange => ({ id: row.change_id, entity: 'newsletter', recordId: row.record_id,
  replicaId: row.replica_id, counter: row.counter, deleted: !!row.deleted, value: JSON.parse(row.value_json) })

export async function validateNewsletterPayload(input: unknown): Promise<Payload> {
  if (!input || typeof input !== 'object') throw Error('Invalid newsletter payload')
  const value = input as { changes?: unknown; archives?: unknown }
  if (!Array.isArray(value.changes) || value.changes.length > 20 || !Array.isArray(value.archives) || value.archives.length > 20) throw Error('At most 20 changes and source archives per batch')
  const changes = value.changes.map(validateChange)
  const originals = new Map<string, string>()
  for (const change of changes) {
    if (change.entity !== 'newsletter' || !/^newsletter-[a-f0-9]{64}$/.test(change.recordId)) throw Error('Only newsletter changes are accepted')
    if (!change.deleted) {
      const doc = validateNewsletter(change.value)
      if (await newsletterId(doc) !== change.recordId) throw Error('Newsletter identity mismatch')
      if (doc.source.sourceArchiveSha256 !== undefined && (typeof doc.source.sourceArchiveSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(doc.source.sourceArchiveSha256) || typeof doc.source.gmailMessageId !== 'string')) throw Error('Invalid original source reference')
      if (typeof doc.source.sourceArchiveSha256 === 'string' && typeof doc.source.gmailMessageId === 'string') originals.set(doc.source.sourceArchiveSha256, doc.source.gmailMessageId)
    }
  }
  const archives: Record<string, unknown>[] = []
  for (const original of value.archives) {
    if (!original || typeof original !== 'object' || Array.isArray(original)) throw Error('Invalid source archive')
    const archive = original as Record<string, unknown>
    if (typeof archive.id !== 'string' || !archive.payload || originals.get(await contentHash(archive)) !== archive.id) throw Error('Source archive hash or message mismatch')
    archives.push(archive)
  }
  return { changes, archives }
}

// Injectable authentication supports local tests; deployed routes always use PIdP.
export function newsletterSyncRoutes(authenticate: (request: Request, env: Env) => Promise<Identity> = async (request, env) => {
  if (!mcpConfiguration(env, request).introspection) throw new EventIntegrationError(503, 'Newsletter sync requires account revocation checks')
  return authenticateMcp(request, env)
}) {
  const routes = new Hono<{ Bindings: Env; Variables: { newsletterIdentity: Identity } }>()
  routes.use('*', bodyLimit({ maxSize: 1024 * 1024 }))
  routes.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    if (c.env.ORGANIZATION_REPLICA_SOURCE) return c.json({ detail: 'Private remote sync is unavailable on a replica' }, 403)
    try {
      const identity = await authenticate(c.req.raw, c.env)
      if (!identity.scopes.includes('org:portal.read') || (c.req.method === 'POST' && !identity.scopes.includes('org:portal.write'))) throw new EventIntegrationError(403, 'Missing portal scope')
      c.set('newsletterIdentity', identity)
    } catch (error) { return newsletterErrorResponse(error) }
    await next()
  })
  routes.get('/status', async c => {
    const { userId, resource } = c.get('newsletterIdentity')
    const counts = await c.env.DB.prepare(`SELECT COUNT(*) changes, COUNT(DISTINCT record_id) records FROM private_newsletter_changes WHERE owner_id=? AND resource=?`).bind(userId, resource).first()
    return c.json({ ownerId: userId, resource, versions: NEWSLETTER_STORAGE, privacy: 'account-only', ...counts })
  })
  routes.get('/changes', async c => {
    const { userId, resource } = c.get('newsletterIdentity'), after = Number(c.req.query('after') || 0)
    if (!Number.isSafeInteger(after) || after < 0) return c.json({ detail: 'Invalid feed cursor' }, 400)
    const page = await c.env.DB.prepare('SELECT * FROM private_newsletter_changes WHERE owner_id=? AND resource=? AND sequence>? ORDER BY sequence LIMIT 20').bind(userId, resource, after).all<Row>()
    return c.json({ resource, changes: page.results.map(decodeNewsletterRow), cursor: page.results.at(-1)?.sequence ?? after, hasMore: page.results.length === 20 })
  })
  routes.get('/archives/:hash', async c => {
    const { userId, resource } = c.get('newsletterIdentity'), hash = c.req.param('hash')
    if (!/^[a-f0-9]{64}$/.test(hash)) return c.json({ detail: 'Invalid archive hash' }, 400)
    const row = await c.env.DB.prepare('SELECT source_json FROM private_newsletter_archives WHERE owner_id=? AND resource=? AND fingerprint=?').bind(userId, resource, hash).first<{ source_json: string }>()
    return row ? c.json(JSON.parse(row.source_json)) : c.json({ detail: 'Source archive not found' }, 404)
  })
  for (const mode of ['preview', 'apply'] as const) routes.post('/' + mode, async c => {
    const { userId, resource } = c.get('newsletterIdentity')
    try { await enforceEventRateLimit(c.env.DB, userId) }
    catch (error) { return newsletterErrorResponse(error) }
    let input: { changes?: unknown; archives?: unknown; previewId?: string }, payload: Payload
    try { input = await c.req.json(); payload = await validateNewsletterPayload(input) }
    catch (error) { return c.json({ detail: String(error) }, 400) }
    const supplied = new Set(await Promise.all(payload.archives.map(contentHash)))
    for (const change of payload.changes) {
      const hash = change.value?.source && (change.value.source as Record<string, unknown>).sourceArchiveSha256
      if (typeof hash === 'string' && !supplied.has(hash)) {
        const original = await c.env.DB.prepare('SELECT fingerprint FROM private_newsletter_archives WHERE owner_id=? AND resource=? AND fingerprint=?').bind(userId, resource, hash).first()
        if (!original) return c.json({ detail: 'Referenced original source archive is required' }, 400)
      }
    }
    const fingerprint = await contentHash(payload), now = new Date().toISOString()
    if (mode === 'preview') {
      const previewId = crypto.randomUUID(), expiresAt = new Date(Date.now() + 600000).toISOString()
      await c.env.DB.prepare('DELETE FROM private_newsletter_previews WHERE expires_at<=?').bind(now).run()
      await c.env.DB.prepare('INSERT INTO private_newsletter_previews(id,owner_id,resource,fingerprint,expires_at) VALUES(?,?,?,?,?)').bind(previewId, userId, resource, fingerprint, expiresAt).run()
      return c.json({ previewId, expiresAt, fingerprint, ownerId: userId, resource, changes: payload.changes.length, archives: payload.archives.length, privacy: 'account-only' })
    }
    const receipt = await c.env.DB.prepare('SELECT id FROM private_newsletter_previews WHERE id=? AND owner_id=? AND resource=? AND fingerprint=? AND expires_at>? AND applied_at IS NULL').bind(input.previewId || '', userId, resource, fingerprint, now).first()
    if (!receipt) return c.json({ detail: 'Matching unexpired account preview required' }, 409)
    const statements = [c.env.DB.prepare('UPDATE private_newsletter_previews SET applied_at=? WHERE id=?').bind(now, input.previewId)]
    for (const change of payload.changes) statements.push(c.env.DB.prepare(`INSERT INTO private_newsletter_changes(owner_id,resource,change_id,record_id,replica_id,counter,deleted,value_json,fingerprint,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,resource,change_id) DO UPDATE SET fingerprint=excluded.fingerprint WHERE fingerprint!=excluded.fingerprint`)
      .bind(userId, resource, change.id, change.recordId, change.replicaId, change.counter, Number(change.deleted), canonicalJson(change.value), await contentHash(change), now))
    for (const archive of payload.archives) statements.push(c.env.DB.prepare('INSERT INTO private_newsletter_archives(owner_id,resource,fingerprint,source_json,created_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING').bind(userId, resource, await contentHash(archive), canonicalJson(archive), now))
    try { await c.env.DB.batch(statements) }
    catch { return c.json({ detail: 'Conflicting immutable change or consumed receipt; batch rolled back' }, 409) }
    return c.json({ acknowledged: payload.changes.map(change => change.id), fingerprint, ownerId: userId, resource, privacy: 'account-only' })
  })
  return routes
}
