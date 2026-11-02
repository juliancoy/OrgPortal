import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { sha3_256 } from '@noble/hashes/sha3.js'

export const U64_MAX = (1n << 64n) - 1n
const encoder = new TextEncoder()
export const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
export function unhex(value: string, length: number): Uint8Array {
  if (!new RegExp(`^[0-9a-f]{${length * 2}}$`).test(value)) throw new Error('Invalid hexadecimal value.')
  return Uint8Array.from(value.match(/../g)!, byte => parseInt(byte, 16))
}
export function units(value: string, allowZero = false): bigint {
  if (!/^(0|[1-9][0-9]{0,19})$/.test(value)) throw new Error('Enter a whole number of QCash units.')
  const amount = BigInt(value)
  if (amount > U64_MAX || (!allowZero && amount === 0n)) throw new Error('Amount is outside the supported range.')
  return amount
}
export function join(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let offset = 0
  for (const p of parts) { out.set(p, offset); offset += p.length }
  return out
}
const label = (s: string) => encoder.encode(s + '\0')
function integer(value: bigint, width: number) {
  const out = new Uint8Array(width)
  for (let i = width - 1; i >= 0; --i) { out[i] = Number(value & 255n); value >>= 8n }
  if (value !== 0n) throw new Error('Integer overflow.')
  return out
}
export type Wallet = { seed: Uint8Array; address: string; publicKey: Uint8Array }
export function walletFromSeed(seed: Uint8Array): Wallet {
  if (seed.length !== 32) throw new Error('Invalid wallet seed.')
  const keys = ml_dsa65.keygen(seed)
  try { return { seed: seed.slice(), publicKey: keys.publicKey, address: hex(sha3_256(join(label('pqcoin/address/ML-DSA-65/v1'), keys.publicKey))) } }
  finally { keys.secretKey.fill(0) }
}
export function createWallet(): Wallet { const seed = crypto.getRandomValues(new Uint8Array(32)); try { return walletFromSeed(seed) } finally { seed.fill(0) } }
export function lockWallet(wallet: Wallet) { wallet.seed.fill(0); wallet.publicKey.fill(0) }
export function signTransfer(wallet: Wallet, chainId: string, recipient: string, amount: string, fee: string, nonce: string) {
  const n = units(amount), f = units(fee, true)
  if (n + f > U64_MAX) throw new Error('Amount plus fee overflows.')
  if (recipient === wallet.address) throw new Error('Choose a different recipient.')
  const body = join(label('pqcoin/transfer/v2'), integer(2n, 4), integer(0x50515431n, 4),
    unhex(wallet.address, 32), unhex(recipient, 32), integer(n, 8), integer(f, 8), integer(units(nonce, true), 8),
    new Uint8Array(32), unhex(chainId, 32))
  const message = join(body, new Uint8Array(32)) // No payment-message envelope in this milestone.
  const keys = ml_dsa65.keygen(wallet.seed)
  try {
    const signature = ml_dsa65.sign(message, keys.secretKey)
    if (!ml_dsa65.verify(signature, message, wallet.publicKey)) throw new Error('Signature verification failed.')
    // app.cpp wire format is canonical body || commitment || raw public key || signature.
    const raw = join(message, wallet.publicKey, signature)
    if (raw.length !== 5472) throw new Error('Unexpected transfer encoding.')
    return { signedTransfer: hex(raw), id: hex(sha3_256(raw)) }
  } finally { keys.secretKey.fill(0) }
}

const ITERATIONS = 600_000
async function backupKey(password: string, salt: Uint8Array, usage: KeyUsage) {
  if (password.length < 12 || password.length > 1024) throw new Error('Use a backup password of 12–1024 characters.')
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt.slice().buffer, iterations: ITERATIONS }, material,
    { name: 'AES-GCM', length: 256 }, false, [usage])
}
export async function exportWallet(wallet: Wallet, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await backupKey(password, salt, 'encrypt')
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: label('pqcoin/wallet-backup/v1') }, key, wallet.seed.slice().buffer))
  return JSON.stringify({ format: 'pqcoin-testnet-wallet-v1', kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: hex(salt), iv: hex(iv), ciphertext: hex(ciphertext) })
}
export async function importWallet(text: string, password: string): Promise<Wallet> {
  if (text.length > 2048) throw new Error('Invalid wallet backup.')
  const b = JSON.parse(text)
  if (b.format !== 'pqcoin-testnet-wallet-v1' || b.kdf !== 'PBKDF2-SHA256' || b.iterations !== ITERATIONS) throw new Error('Unsupported wallet backup.')
  const salt = unhex(b.salt, 16), iv = unhex(b.iv, 12), encrypted = unhex(b.ciphertext, 48)
  const key = await backupKey(password, salt, 'decrypt')
  const seed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.slice().buffer, additionalData: label('pqcoin/wallet-backup/v1') }, key, encrypted.slice().buffer))
  try { return walletFromSeed(seed) } finally { seed.fill(0) }
}

export type { WalletChallenge } from '../../../../shared/qcashWalletProof'
import { walletProofMessage, type WalletChallenge } from '../../../../shared/qcashWalletProof'
export function signWalletLink(wallet: Wallet, c: WalletChallenge & { message: string }, userId: string, origin: string, chainId: string) {
  if (!Number.isSafeInteger(c.challengeExpiresAt) || !Number.isSafeInteger(c.linkExpiresAt) || c.linkExpiresAt <= Date.now() || !/^[0-9a-f-]{36}$/.test(c.challengeId) || typeof c.expectedRevision !== 'string' || c.expectedRevision.length > 36
    || c.portalOrigin !== origin || c.userId !== userId || c.chainId !== chainId || c.address !== wallet.address || c.publish !== true || c.message !== walletProofMessage(c)
    || c.challengeExpiresAt <= Date.now() || c.challengeExpiresAt > Date.now() + 660000 || c.linkExpiresAt > Date.now() + 91 * 86400000) throw new Error('Wallet linking challenge is invalid or expired.')
  const keys = ml_dsa65.keygen(wallet.seed)
  try { return { challengeId: c.challengeId, publicKey: hex(wallet.publicKey), signature: hex(ml_dsa65.sign(new TextEncoder().encode(c.message), keys.secretKey)) } }
  finally { keys.secretKey.fill(0) }
}
export type WalletRecipient = { userId: string; name: string; profileSlug: string; address: string; revision: string; expiresAt: number; publicKey: string; signature: string; proofMessage: string }
export function verifyWalletRecipient(p: WalletRecipient, origin: string, chainId: string): void {
  const message = JSON.parse(p.proofMessage)
  const key = unhex(p.publicKey, 1952)
  if (!Array.isArray(message) || message.length !== 10 || message[0] !== 'QCash/profile-wallet-link/v1' || message[1] !== origin || message[2] !== p.userId || message[3] !== chainId
    || message[4] !== p.address || message[5] !== p.revision || message[7] !== p.expiresAt || message[9] !== true || !Number.isSafeInteger(p.expiresAt) || p.expiresAt <= Date.now()
    || hex(sha3_256(join(label('pqcoin/address/ML-DSA-65/v1'), key))) !== p.address
    || !ml_dsa65.verify(unhex(p.signature, 3309), new TextEncoder().encode(p.proofMessage), key)) throw new Error('Recipient wallet ownership proof is invalid or expired.')
}
