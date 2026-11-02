import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'

const digest = z.string().regex(/^[0-9a-f]{64}$/)
const u64 = z.string().regex(/^(0|[1-9][0-9]{0,19})$/).refine(value => BigInt(value) <= 18446744073709551615n)
const network = z.object({ currency: z.enum(['QCash','PQT']), name: z.enum(['QCash Testnet','PQCoin Testnet']), chainId: digest, height: z.number().int().nonnegative().safe(), tip: digest, decimals: z.literal(0), experimental: z.literal(true) })
const receipt = z.object({ id: digest, status: z.enum(['pending', 'confirmed', 'unknown']), confirmations: z.number().int().nonnegative().safe() })
const transfer = receipt.extend({ sender: digest, recipient: digest, amount: u64, fee: u64 })
const account = z.object({ address: digest, spendable: u64, immature: u64, nonce: u64, transactions: z.array(transfer).max(178) })
type GatewayConfig = Pick<PqcoinRuntimeBindings, 'PQCOIN_GATEWAY_URL' | 'PQCOIN_CHAIN_ID' | 'QCASH_GATEWAY_URL' | 'QCASH_CHAIN_ID'> & { ENV?: string; QCASH_GATEWAY_TOKEN?: string }
export type GatewayFetch = (input: string, init?: RequestInit) => Promise<Response>

async function boundedJson(response: Response) {
  if (!response.body || !response.headers.get('Content-Type')?.includes('application/json')) throw new Error('Invalid gateway response')
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break
      size += value.byteLength
      if (size > 262144) { await reader.cancel(); throw new Error('Gateway response too large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}
export function pqcoinRoutes(gatewayFetch: GatewayFetch = (url, init) => fetch(url, init)) {
  const app = new Hono<{ Bindings: Partial<GatewayConfig> }>()
  app.use('*', bodyLimit({ maxSize: 12000 }), async (c, next) => { c.header('Cache-Control', 'no-store'); await next() })
  app.all('*', async c => {
    const path = c.req.path.replace(/^.*\/api\/(?:pqcoin|qcash)/, '') || '/'
    const resource = path === '/network' ? 'network' : /^\/accounts\/[0-9a-f]{64}$/.test(path) ? 'account' : /^\/transactions\/[0-9a-f]{64}$/.test(path) ? 'receipt' : path === '/transactions' ? 'submit' : null
    if (!resource || c.req.url.includes('?')) return c.json({ error: 'Unknown testnet endpoint.' }, 404)
    if ((resource === 'submit' && c.req.method !== 'POST') || (resource !== 'submit' && c.req.method !== 'GET')) return c.json({ error: 'Method not allowed.' }, 405)
    const chain = c.env.QCASH_CHAIN_ID || c.env.PQCOIN_CHAIN_ID, configured = c.env.QCASH_GATEWAY_URL || c.env.PQCOIN_GATEWAY_URL
    if (!chain || !digest.safeParse(chain).success || !configured) return c.json({ error: 'QCash Testnet is not configured on this portal.' }, 503)
    let url: URL
    try {
      url = new URL(configured)
      if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(c.env.ENV === 'development' && url.protocol === 'http:'))) throw new Error('Invalid gateway configuration')
    } catch { return c.json({ error: 'Testnet gateway configuration is invalid.' }, 503) }
    let body: string | undefined
    if (resource === 'submit') {
      if (!c.req.header('Content-Type')?.startsWith('application/json')) return c.json({ error: 'Expected JSON.' }, 415)
      const parsed = z.object({ signedTransfer: z.string().regex(/^[0-9a-f]{10944}$/) }).strict().safeParse(await c.req.json().catch(() => null))
      if (!parsed.success) return c.json({ error: 'Expected a signed testnet transfer; private keys are never accepted.' }, 400)
      body = JSON.stringify(parsed.data)
    }
    try {
      const base = url.href.replace(/\/$/, '')
      // Workers supports manual/follow, not redirect:error. Reject all non-2xx
      // responses below so the service credential never follows a redirect.
      const init = { redirect: 'manual' as const, signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json', ...(c.env.QCASH_GATEWAY_TOKEN ? { Authorization: `Bearer ${c.env.QCASH_GATEWAY_TOKEN}` } : {}) } }
      const response = await gatewayFetch(base + '/network', init)
      if (!response.ok) throw new Error('Gateway unavailable')
      const parsedNetwork = network.parse(await boundedJson(response))
      const current = { ...parsedNetwork, currency: 'QCash', name: 'QCash Testnet' }
      if (current.chainId !== chain) return c.json({ error: 'Testnet network mismatch. Requests are disabled.' }, 503)
      if (resource === 'network') return c.json(current)
      const result = await gatewayFetch(base + path, { ...init, method: resource === 'submit' ? 'POST' : 'GET', headers: { ...init.headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body })
      if (!result.ok) return c.json({ error: resource === 'submit' ? 'Transfer rejected or submission uncertain. Check funds and nonce; retry the same signed transfer.' : 'Testnet lookup failed.' }, result.status >= 500 ? 503 : 400)
      const raw = await boundedJson(result)
      if (resource === 'account') {
        const value = account.parse(raw)
        if (value.address !== path.slice('/accounts/'.length)) throw new Error('Address mismatch')
        return c.json(value)
      }
      const value = receipt.parse(raw)
      if (resource === 'receipt' && value.id !== path.slice('/transactions/'.length)) throw new Error('Transaction mismatch')
      return c.json(value, resource === 'submit' ? 202 : 200)
    } catch { return c.json({ error: 'Testnet gateway unavailable or returned an invalid response.' }, 503) }
  })
  return app
}
