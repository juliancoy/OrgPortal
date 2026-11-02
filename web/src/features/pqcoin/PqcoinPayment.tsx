import { useAuth } from '../../app/AppProviders'
import { ProfileWallet, ProfileRecipientPicker, profileFetch } from './ProfileWallet'
import { verifyWalletRecipient, type WalletRecipient } from './wallet'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { portalUrl } from '../../config/portalBase'
import { createQrSvg } from '../../ui/utils/qr'
import { paymentLink, pqcoinFetch, validateRequest, type Account, type Network } from './api'
import { createWallet, exportWallet, importWallet, lockWallet, signTransfer, units } from './wallet'
import { useWallet } from './WalletBoundary'

export function PqcoinPayment({ mode }: { mode: 'send' | 'receive' }) {
  const { wallet, setWallet } = useWallet()
  const { token } = useAuth()
  const [person, setPerson] = useState<WalletRecipient | null>(null)
  const networkId = useRef('')
  const [network, setNetwork] = useState<Network | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [loadError, setLoadError] = useState('')
  const [status, setStatus] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [recipient, setRecipient] = useState(() => new URLSearchParams(location.search).get('to') || '')
  const [amount, setAmount] = useState(() => new URLSearchParams(location.search).get('amount') || '10')
  const [fee, setFee] = useState('0')
  const [review, setReview] = useState(false)
  const [lastSigned, setLastSigned] = useState<{ signedTransfer: string; id: string; chain: string } | null>(null)
  const [receipt, setReceipt] = useState('')

  useEffect(() => {
    let active = true, pending = false
    setAccount(null); setReview(false); setReceipt(''); setLastSigned(null)
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const n = await pqcoinFetch<Network>('/network')
        if (n.currency !== 'QCash' || n.decimals !== 0 || !n.experimental || !/^[0-9a-f]{64}$/.test(n.chainId)) throw new Error('Unsupported testnet configuration.')
        const a = wallet ? await pqcoinFetch<Account>(`/accounts/${wallet.address}`) : null
        if (a) { units(a.spendable, true); units(a.immature, true); units(a.nonce, true); if (a.address !== wallet?.address) throw new Error('Wallet response mismatch.') }
        if (active) { if (networkId.current && networkId.current !== n.chainId) { setReview(false); setLastSigned(null); setStatus('Network changed. Review the payment again.') }; networkId.current = n.chainId; setNetwork(n); setAccount(a); setLoadError('') }
      } catch (error) { if (active) { setLoadError(error instanceof Error ? error.message : 'Testnet unavailable.'); setReview(false) } }
      finally { pending = false }
    }
    void refresh(); const timer = setInterval(() => { void refresh() }, 3000)
    return () => { active = false; clearInterval(timer) }
  }, [wallet])

  const requestError = network ? validateRequest(location.search, network) : ''
  const pending = !!account?.transactions.some(tx => tx.sender === wallet?.address && tx.status === 'pending')
  const link = useMemo(() => {
    if (!wallet || !network) return ''
    try { units(amount); return paymentLink(wallet.address, amount, network.chainId, portalUrl('/send')) } catch { return '' }
  }, [wallet, network, amount])
  const qr = useMemo(() => { try { return link ? createQrSvg(link, 6, 4) : '' } catch { return '' } }, [link])

  async function create() {
    setBusy(true); setStatus('')
    let value: ReturnType<typeof createWallet> | null = null
    try {
      value = createWallet(); const backup = await exportWallet(value, password)
      const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `qcash-testnet-${value.address.slice(0, 12)}.json`; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setWallet(value); value = null; setPassword(''); setStatus('Wallet created. Keep the downloaded backup and its password safe.')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to create wallet.') }
    finally { if (value) lockWallet(value); setBusy(false) }
  }
  async function restore(file: File | undefined) {
    if (!file) return
    setBusy(true); setStatus('')
    try { if (file.size > 2048) throw new Error('Invalid wallet backup.'); setWallet(await importWallet(await file.text(), password)); setPassword(''); setStatus('Wallet unlocked.') }
    catch { setStatus('Unable to unlock backup. Check the file and password.') }
    finally { setBusy(false) }
  }
  function checkPayment() {
    if (!wallet || !account || !network || loadError || requestError) throw new Error('Connect to the correct testnet and unlock your wallet first.')
    if (!/^[0-9a-f]{64}$/.test(recipient) || recipient === wallet.address) throw new Error('Enter a different valid QCash wallet address.')
    if (units(amount) + units(fee, true) > units(account.spendable, true)) throw new Error('Insufficient spendable QCash.')
    if (pending) throw new Error('Wait for your pending transfer before sending another.')
  }
  async function checkRecipient() {
    if (!person) return
    if (!token || !network) throw new Error('Sign in again and choose the recipient.')
    const current = await profileFetch<WalletRecipient>(token, '/recipients/' + encodeURIComponent(person.userId))
    verifyWalletRecipient(current, location.origin, network.chainId)
    if (current.userId !== person.userId || current.address !== recipient || current.revision !== person.revision) throw new Error('Recipient wallet link changed. Choose the recipient and review the payment again.')
  }
  async function reviewPayment(event: FormEvent) {
    event.preventDefault(); setStatus('')
    try { checkPayment(); await checkRecipient(); setReview(true) } catch (error) { setStatus(error instanceof Error ? error.message : 'Invalid payment.') }
  }
  async function broadcast(signed: { signedTransfer: string; id: string; chain: string }) {
    if (!network || signed.chain !== network.chainId || requestError || loadError) throw new Error('Network unavailable or changed. Submission stopped.')
    const result = await pqcoinFetch<{ id: string; status: string }>('/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signedTransfer: signed.signedTransfer }) })
    if (result.id !== signed.id) throw new Error('Node returned a different transaction ID.')
    setReceipt(signed.id); setLastSigned(null); setStatus('Transfer submitted. Waiting for the chain to confirm it.'); setReview(false)
  }
  async function send() {
    setBusy(true)
    try {
      checkPayment()
      await checkRecipient()
      const signed = { ...signTransfer(wallet!, network!.chainId, recipient, amount, fee, account!.nonce), chain: network!.chainId }
      setLastSigned(signed); setReceipt(signed.id)
      await broadcast(signed)
    } catch (error) { setStatus(`${error instanceof Error ? error.message : 'Submission failed.'} If submission is uncertain, retry the same signed transfer below.`) }
    finally { setBusy(false); setReview(false) }
  }
  async function retry() {
    if (!lastSigned) return
    setBusy(true)
    try { await broadcast(lastSigned) } catch { setStatus('Submission remains uncertain. Check the transaction or retry the same transfer.') }
    finally { setBusy(false) }
  }
  const observed = account?.transactions.find(tx => tx.id === receipt)
  return <section className="portal-section" aria-label="QCash testnet wallet">
    <h1>{mode === 'send' ? 'Send' : 'Receive'} QCash Testnet</h1>
    <p>Experimental QCash · Test coins have no stated monetary value. Uses ML-DSA signatures; consensus has not been independently audited. Transfers publish addresses and amounts to this testnet.</p>
    <p><Link to="/send?currency=QCash">Send QCash</Link> · <Link to="/receive?currency=QCash">Receive QCash</Link></p>
    {network && <p style={{ overflowWrap: 'anywhere' }}>Network: <code>{network.chainId}</code> · Height {network.height}</p>}
    {loadError && <p role="alert">{loadError}</p>}{requestError && <p role="alert">{requestError}</p>}
    {!wallet ? <div className="portal-card portal-form">
      <h2>Your test wallet</h2><p>Your signing key stays in this browser tab while unlocked. Locking, hiding or reloading the tab clears it. Unlock again with your encrypted backup.</p>
      <label>Backup password<input type="password" minLength={12} maxLength={1024} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button type="button" disabled={busy || password.length < 12} onClick={() => { void create() }}>Create wallet and download backup</button>
      <label>Unlock encrypted wallet backup<input type="file" accept="application/json,.json" disabled={busy || password.length < 12} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void restore(file) }} /></label>
    </div> : <>
      <div className="portal-card"><h2>Your QCash wallet</h2><p style={{ overflowWrap: 'anywhere' }}><strong>Wallet address</strong><br /><code data-testid="pqt-address">{wallet.address}</code></p>
        <p>Spendable: <strong data-testid="pqt-spendable">{account?.spendable ?? '—'} QCash</strong> · Immature mining rewards: {account?.immature ?? '—'} QCash</p>
        <button type="button" disabled={busy} onClick={() => setWallet(null)}>Lock wallet</button>
      </div>
      {mode === 'send' ? <form className="portal-card portal-form" onSubmit={reviewPayment}>
        {network && <ProfileRecipientPicker chainId={network.chainId} onSelect={value => { setPerson(value); setRecipient(value.address); setReview(false) }} />}
        {person && <p>Recipient: {person.name} · {person.profileSlug}</p>}
        <label>Recipient QCash wallet address<input value={recipient} required maxLength={64} spellCheck={false} autoComplete="off" onChange={e => { setRecipient(e.target.value.trim()); setPerson(null); setReview(false) }} /></label>
        <p>Choose a verified profile above, or use a QCash wallet address or payment QR. Dena balances remain separate.</p>
        <label>Amount (QCash)<input inputMode="numeric" value={amount} onChange={e => { setAmount(e.target.value); setReview(false) }} required /></label>
        <label>Network fee (QCash)<input inputMode="numeric" value={fee} onChange={e => { setFee(e.target.value); setReview(false) }} required /></label>
        <p>Whole QCash units. No currency conversion. {pending && 'A transfer is pending.'}</p>
        <button disabled={busy || pending || !!lastSigned || !!loadError || !!requestError || !account} type="submit">Review payment</button>
        {review && <div role="region" aria-label="Review QCash payment" style={{ overflowWrap: 'anywhere' }}><h2>Review payment</h2><p>{person ? `${person.name} (${person.profileSlug}) · ` : ''}Send {amount} QCash to <code>{recipient}</code></p><p>Fee: {fee} QCash. Total: {(units(amount) + units(fee, true)).toString()} QCash.</p><p>Network: <code>{network?.chainId}</code></p>
          <button type="button" disabled={busy} onClick={() => { void send() }}>Authorize and send QCash</button><button type="button" onClick={() => setReview(false)}>Cancel</button></div>}
      </form> : <div className="portal-card portal-form">
        <label>Requested amount (QCash)<input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>Payment request link<input value={link} readOnly /></label>
        <button disabled={!link} type="button" onClick={() => { void navigator.clipboard.writeText(link).then(() => setStatus('Payment link copied.'), () => setStatus('Unable to copy. Select the payment link to copy it.')) }}>Copy link</button>
        {qr && <div style={{ maxWidth: 320, width: '100%' }} aria-label="QCash payment QR" dangerouslySetInnerHTML={{ __html: qr }} />}
      </div>}
      {receipt && <p style={{ overflowWrap: 'anywhere' }}>Transaction: <code>{receipt}</code><br />{observed ? `${observed.status} · ${observed.confirmations} confirmations` : 'Not observed on the current chain yet. A previously confirmed transaction may have been reorganized out.'}</p>}
      {lastSigned && <button type="button" disabled={busy || !!loadError || !!requestError} onClick={() => { void retry() }}>Retry same signed transfer</button>}
      <div className="portal-card"><h2>Recent QCash transfers</h2>{!account?.transactions.length ? <p>No transfers on this chain yet.</p> : <ul>{account.transactions.map(tx => <li key={tx.id} style={{ overflowWrap: 'anywhere' }}>{tx.recipient === wallet.address ? 'Received' : 'Sent'} {tx.amount} QCash · {tx.status} · {tx.confirmations} confirmations<br /><code>{tx.id}</code></li>)}</ul>}<p>Confirmations can change during a reorganization. This development wallet has no guaranteed finality threshold.</p></div>
    </>}
    {network && mode === 'receive' && <ProfileWallet chainId={network.chainId} />}
    <p role="status" aria-live="polite">{busy ? 'Working…' : observed?.status === 'confirmed' && status.startsWith('Transfer submitted') ? `Transfer confirmed · ${observed.confirmations} confirmations.` : status}</p>
  </section>
}
