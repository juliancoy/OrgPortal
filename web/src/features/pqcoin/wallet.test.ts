import { describe, expect, it } from 'vitest'
import { exportWallet, hex, importWallet, lockWallet, signTransfer, units, walletFromSeed } from './wallet'
import { paymentLink, validateRequest, type Network } from './api'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
const chain = 'ab'.repeat(32), recipient = 'cd'.repeat(32)
describe('self-custody testnet wallet', () => {
  it('signs the exact native transfer body and protects chain and amount', () => {
    const wallet = walletFromSeed(new Uint8Array(32).fill(1))
    const result = signTransfer(wallet, chain, recipient, '9007199254740993', '1', '0')
    const raw = Uint8Array.from(result.signedTransfer.match(/../g)!, b => parseInt(b, 16))
    expect(raw.length).toBe(5472)
    expect(ml_dsa65.verify(raw.slice(-3309), raw.slice(0, 211), wallet.publicKey)).toBe(true)
    raw[100] ^= 1
    expect(ml_dsa65.verify(raw.slice(-3309), raw.slice(0, 211), wallet.publicKey)).toBe(false)
    expect(() => signTransfer(wallet, chain, wallet.address, '1', '0', '0')).toThrow()
    expect(() => signTransfer(wallet, chain, recipient, '18446744073709551615', '1', '0')).toThrow()
    lockWallet(wallet); expect(hex(wallet.seed)).toBe('00'.repeat(32))
  })
  it('round trips only an authenticated encrypted seed backup', async () => {
    const wallet = walletFromSeed(new Uint8Array(32).fill(2)), password = 'test-only-long-password'
    const encrypted = await exportWallet(wallet, password)
    expect(encrypted).not.toContain(hex(wallet.seed))
    const imported = await importWallet(encrypted, password)
    expect(imported.address).toBe(wallet.address)
    await expect(importWallet(encrypted, 'wrong-long-password')).rejects.toThrow()
    const modified = JSON.parse(encrypted); modified.iv = '00'.repeat(12)
    await expect(importWallet(JSON.stringify(modified), password)).rejects.toThrow()
    lockWallet(imported); lockWallet(wallet)
  })
  it('rejects floating point, exponent notation, negatives and overflow', () => {
    for (const value of ['1.01', '1e4', '-1', '01', 'NaN', '18446744073709551616']) expect(() => units(value)).toThrow()
    expect(units('9007199254740993')).toBe(9007199254740993n)
  })
  it('binds request links to a network and refuses ambiguous requests', () => {
    const network = { chainId: chain } as Network
    const link = paymentLink(recipient, '25', chain, 'https://localhost/send')
    expect(validateRequest(new URL(link).search, network)).toBe('')
    expect(validateRequest(`?currency=QCash&to=${recipient}`, network)).not.toBe('')
    expect(validateRequest(`?currency=QCash&chain=${recipient}&to=${recipient}`, network)).not.toBe('')
    expect(validateRequest(`?currency=QCash&currency=DEM`, network)).not.toBe('')
  })
})

describe('QCash wallet profile proofs', () => {
  it('separates account-link signatures from payments and pins account, portal, wallet and chain', async () => {
    const { signWalletLink, verifyWalletRecipient } = await import('./wallet')
    const { walletProofMessage } = await import('../../../../shared/qcashWalletProof')
    const w = walletFromSeed(new Uint8Array(32).fill(9)), origin = 'https://localhost'
    const c = { challengeId: crypto.randomUUID(), portalOrigin: origin, userId: 'alice', chainId: chain, address: w.address, challengeExpiresAt: Date.now() + 600000, linkExpiresAt: Date.now() + 90 * 86400000, expectedRevision: '', publish: true as const }
    const message = walletProofMessage(c), proof = signWalletLink(w, { ...c, message }, 'alice', origin, chain)
    const person = { userId: 'alice', name: 'Alice', profileSlug: 'alice', address: w.address, revision: c.challengeId, expiresAt: c.linkExpiresAt, publicKey: proof.publicKey, signature: proof.signature, proofMessage: message }
    expect(() => verifyWalletRecipient(person, origin, chain)).not.toThrow()
    expect(() => verifyWalletRecipient({ ...person, address: recipient }, origin, chain)).toThrow()
    expect(() => verifyWalletRecipient(person, 'https://other.invalid', chain)).toThrow()
    expect(() => signWalletLink(w, { ...c, message }, 'bob', origin, chain)).toThrow()
    expect(() => signWalletLink(w, { ...c, message: 'not a wallet link' }, 'alice', origin, chain)).toThrow()
    expect(() => signWalletLink(w, { ...c, challengeExpiresAt: Number.NaN, message }, 'alice', origin, chain)).toThrow()
    lockWallet(w)
  })
})
