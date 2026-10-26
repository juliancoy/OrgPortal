const { createServer } = require('node:http')
const { randomBytes, createHash, timingSafeEqual } = require('node:crypto')

async function browserAuth({ session, portalOrigin, issuer, openExternal, onComplete, onError }) {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(32).toString('base64url')
  let flow, busy = false, stopped = false, timer
  const abort = new AbortController()
  function cancel() {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    abort.abort()
    server.close()
    server.closeAllConnections()
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'")
    const url = new URL(req.url, 'http://127.0.0.1')
    const received = url.searchParams.get('state') || ''
    const expectedHost = `127.0.0.1:${server.address()?.port}`
    if (req.method !== 'GET' || req.headers.host !== expectedHost || url.pathname !== '/callback' || !flow || busy || stopped || ['state','request','code'].some(key => url.searchParams.getAll(key).length !== 1) || !(/^[A-Za-z0-9_-]{43}$/).test(received) || received.length !== state.length || !timingSafeEqual(Buffer.from(received), Buffer.from(state)) || url.searchParams.get('request') !== flow.request || !/^[A-Za-z0-9_-]{43,100}$/.test(url.searchParams.get('code') || '')) {
      res.writeHead(400); res.end('Invalid or expired OrgPortal sign-in.'); return
    }
    busy = true
    try {
      const response = await session.fetch(new URL('/pidp/auth/sso/complete', portalOrigin).href, {
        method: 'POST', credentials: 'include', redirect: 'manual', signal: abort.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: flow.request, code: url.searchParams.get('code'), code_verifier: verifier }),
      })
      if (response.status !== 200) throw Error('PIdP could not complete browser sign-in. Start again.')
      const result = await response.json()
      const destination = new URL(result.next, portalOrigin)
      if (destination.origin !== portalOrigin || destination.pathname !== '/auth/callback') throw Error('PIdP returned an invalid sign-in destination.')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><title>OrgPortal sign-in complete</title><main style="font:18px system-ui;max-width:560px;margin:12vh auto;padding:24px"><h1>Signed in to OrgPortal</h1><p>You can close this window and return to the OrgPortal app.</p></main>')
      await onComplete(destination.href)
      cancel()
    } catch (error) {
      if (!res.writableEnded) { res.writeHead(400); res.end('OrgPortal sign-in failed. Return to the app and try again.') }
      cancel(); onError(error)
    }
  })
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const start = new URL('/pidp/auth/sso/start', portalOrigin)
    start.search = new URLSearchParams({ app: 'orgportal', next: '/auth/callback?next=%2Forg-events', redirect_uri: `http://127.0.0.1:${server.address().port}/callback`, code_challenge: challenge, code_challenge_method: 'S256', state }).toString()
    const response = await session.fetch(start.href, { credentials: 'include', redirect: 'manual', signal: abort.signal })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw Error('This PIdP server does not support desktop browser sign-in yet. Use Sign in Here.')
    flow = await response.json()
    const authorize = new URL(flow.authorization_url)
    const expectedIssuer = new URL(issuer.replace(/\/$/, '')+'/auth/sso/authorize')
    if (authorize.protocol !== 'https:' || authorize.username || authorize.password || authorize.origin !== expectedIssuer.origin || authorize.pathname !== expectedIssuer.pathname || authorize.searchParams.get('request') !== flow.request || !/^[A-Za-z0-9_-]{43,100}$/.test(flow.request)) throw Error('PIdP returned an invalid browser authorization URL.')
    timer = setTimeout(() => { cancel(); onError(Error('Browser sign-in expired. Start again.')) }, 600000)
    await openExternal(authorize.href)
    return { cancel }
  } catch (error) { cancel(); throw error }
}
module.exports = { browserAuth }
