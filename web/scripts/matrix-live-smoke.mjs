#!/usr/bin/env node

const baseUrl = (process.env.MATRIX_BASE_URL || 'http://synapse:8008').replace(/\/$/, '')
const username = process.env.MATRIX_SMOKE_USER || 'orgportal_smoke'
const password = process.env.MATRIX_SMOKE_PASSWORD || 'orgportal_smoke_pw'
const userIdHint = process.env.MATRIX_SMOKE_USER_ID || `@${username}:matrix.arkavo.org`
const timeoutMs = Number(process.env.MATRIX_SMOKE_TIMEOUT_MS || '15000')

function withTimeout(signal, ms) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error(`Timeout after ${ms}ms`)), ms)
  signal?.addEventListener('abort', () => ctrl.abort(signal.reason), { once: true })
  return { signal: ctrl.signal, done: () => clearTimeout(timer) }
}

async function request(path, init = {}, { expectOk = true } = {}) {
  const timeout = withTimeout(init.signal, timeoutMs)
  try {
    const resp = await fetch(`${baseUrl}${path}`, { ...init, signal: timeout.signal })
    const text = await resp.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    if (expectOk && !resp.ok) {
      throw new Error(`${path} failed (${resp.status}): ${typeof data === 'string' ? data : JSON.stringify(data)}`)
    }
    return { resp, data }
  } finally {
    timeout.done()
  }
}

async function main() {
  console.log(`[matrix-live-smoke] baseUrl=${baseUrl}`)
  console.log(`[matrix-live-smoke] login user=${username}`)

  await request('/_matrix/client/versions')

  const { data: login } = await request('/_matrix/client/v3/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: username },
      password,
      initial_device_display_name: 'orgportal-live-smoke',
    }),
  })

  if (!login?.access_token || !login?.user_id) {
    throw new Error('Login succeeded but response did not include access_token and user_id')
  }

  const token = login.access_token
  const userId = login.user_id
  const authHeaders = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  }

  if (userIdHint && userId !== userIdHint) {
    console.warn(`[matrix-live-smoke] warning: user_id mismatch expected=${userIdHint} actual=${userId}`)
  }

  const roomName = `orgportal-smoke-${Date.now()}`
  const { data: createRoom } = await request('/_matrix/client/v3/createRoom', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: roomName,
      visibility: 'private',
      preset: 'private_chat',
    }),
  })
  const roomId = createRoom?.room_id
  if (!roomId) throw new Error('createRoom response missing room_id')

  const txnId = `smoke-${Date.now()}`
  const smokeBody = `orgportal matrix smoke ${Date.now()}`
  await request(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      msgtype: 'm.text',
      body: smokeBody,
    }),
  })

  const { data: sync } = await request('/_matrix/client/v3/sync?timeout=0', {
    headers: { authorization: `Bearer ${token}` },
  })
  const timeline = sync?.rooms?.join?.[roomId]?.timeline?.events || []
  const found = Array.isArray(timeline)
    ? timeline.some((event) => event?.type === 'm.room.message' && event?.content?.body === smokeBody)
    : false

  if (!found) {
    throw new Error('Message send succeeded but event not found in sync timeline')
  }

  console.log(`[matrix-live-smoke] PASS user=${userId} room=${roomId}`)
}

main().catch((err) => {
  console.error(`[matrix-live-smoke] FAIL ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
