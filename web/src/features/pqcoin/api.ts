export type Network = { currency: 'QCash'; name: string; chainId: string; height: number; tip: string; decimals: 0; experimental: true }
export type Transaction = { id: string; status: 'pending' | 'confirmed' | 'unknown'; confirmations: number; sender: string; recipient: string; amount: string; fee: string }
export type Account = { address: string; spendable: string; immature: string; nonce: string; transactions: Transaction[] }
const base = '/api/org/api/qcash'
export async function pqcoinFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(base + path, { ...options, cache: 'no-store', signal: AbortSignal.timeout(15000) })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'The testnet is unavailable.')
  return body as T
}
export function paymentLink(address: string, amount: string, chainId: string, sendUrl: string): string {
  if (!/^[0-9a-f]{64}$/.test(address) || !/^[0-9a-f]{64}$/.test(chainId)) throw new Error('Invalid testnet payment request.')
  return `${sendUrl}?${new URLSearchParams({ currency: 'QCash', chain: chainId, to: address, amount })}`
}
export function validateRequest(search: string, network: Network): string {
  const p = new URLSearchParams(search)
  if (p.getAll('currency').length > 1 || p.getAll('chain').length > 1 || p.getAll('to').length > 1 || p.getAll('amount').length > 1) return 'Ambiguous payment request.'
  if (p.has('chain') && p.get('chain') !== network.chainId) return 'This payment request belongs to a different network.'
  if (p.has('to') && (!p.has('chain') || !/^[0-9a-f]{64}$/.test(p.get('to') || ''))) return 'A QCash payment request needs a valid address and network.'
  return ''
}
