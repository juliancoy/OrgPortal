import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../../app/AppProviders'
import { SignInLink } from '../../ui/components/SignInLink'
import { pqcoinFetch } from './api'
import { useWallet } from './WalletBoundary'
import { signWalletLink, verifyWalletRecipient, type WalletChallenge, type WalletRecipient } from './wallet'
export function profileFetch<T>(token: string, path: string, init?: RequestInit) {
  return pqcoinFetch<T>('/profile-wallet' + path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers } })
}
export function ProfileWallet({ chainId }: { chainId: string }) {
  const { token, user } = useAuth(), { wallet } = useWallet()
  const [linked, setLinked] = useState<{ address: string; revision: string; expiresAt: number } | null>(null)
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [status, setStatus] = useState('')
  useEffect(() => {
    let active = true; setLinked(null); setConsent(false)
    if (token) void profileFetch<typeof linked>(token, '/me').then(value => { if (active) setLinked(value) }, () => { if (active) setStatus('Profile linking is unavailable. You can still use wallet addresses.') })
    return () => { active = false }
  }, [token, chainId])
  async function link() {
    if (!wallet || !token || !user || !consent) return
    setBusy(true)
    try {
      const challenge = await profileFetch<WalletChallenge & { message: string }>(token, '/challenge', { method: 'POST', body: JSON.stringify({ address: wallet.address, publish: true }) })
      const proof = signWalletLink(wallet, challenge, user.id, location.origin, chainId)
      const value = await profileFetch<NonNullable<typeof linked>>(token, '/verify', { method: 'POST', body: JSON.stringify(proof) })
      setLinked(value); setConsent(false); setStatus('Verified wallet linked to your profile.')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to link wallet.') }
    finally { setBusy(false) }
  }
  async function unlink() {
    if (!token) return
    setBusy(true)
    try { await profileFetch(token, '/me', { method: 'DELETE' }); setLinked(null); setConsent(false); setStatus('Wallet link removed. Blockchain transfers are unchanged.') }
    catch { setStatus('Unable to remove wallet link. Retry.') }
    finally { setBusy(false) }
  }
  return <section className="portal-card portal-form" aria-label="QCash profile wallet">
    <h2>Send and receive by profile name</h2>
    {!token ? <p><SignInLink /> to link a wallet or find recipients by name. Wallet-address payments work without portal sign-in.</p> : <>
      {linked && <p style={{ overflowWrap: 'anywhere' }}>Linked wallet: <code>{linked.address}</code><br />Expires {new Date(linked.expiresAt).toLocaleDateString()}.</p>}
      <p><Link to="/profile">Manage your public profile</Link></p>
      <p>Linking proves you control this wallet. People signed into this portal can find it only while your profile is public. Links expire after 90 days and can be removed here.</p>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}><input style={{ width: 'auto', flex: '0 0 auto', marginTop: 4 }} type="checkbox" checked={consent} disabled={busy || !wallet} onChange={event => setConsent(event.target.checked)} /> I authorize publishing this wallet link on my public profile.</label>
      <button type="button" disabled={busy || !wallet || !consent} onClick={() => { void link() }}>{linked ? 'Authorize wallet link replacement' : 'Authorize profile wallet link'}</button>
      {linked && <button type="button" disabled={busy} onClick={() => { void unlink() }}>Remove profile wallet link</button>}
    </>}
    <p role="status">{busy ? 'Checking wallet ownership…' : status}</p>
  </section>
}
export function ProfileRecipientPicker({ chainId, onSelect }: { chainId: string; onSelect: (value: WalletRecipient) => void }) {
  const { token } = useAuth(); const [query, setQuery] = useState(''), [people, setPeople] = useState<WalletRecipient[]>([]), [status, setStatus] = useState('')
  useEffect(() => {
    let active = true; setPeople([])
    if (!token || query.trim().length < 2) return
    const timer = setTimeout(() => {
      void profileFetch<{ people: WalletRecipient[] }>(token, '/recipients?q=' + encodeURIComponent(query.trim())).then(result => {
        if (active) { setPeople(result.people); setStatus(result.people.length ? '' : 'No public profiles with verified wallets found.') }
      }, () => { if (active) setStatus('Recipient lookup unavailable. Use a wallet address instead.') })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [token, query, chainId])
  if (!token) return null
  return <div className="portal-form"><label>Find QCash recipient by name<input value={query} maxLength={80} autoComplete="off" onChange={e => setQuery(e.target.value)} /></label>
    {people.map(person => <button type="button" key={person.userId} onClick={() => {
      try { verifyWalletRecipient(person, location.origin, chainId); onSelect(person); setQuery(''); setStatus(`Selected ${person.name} (${person.profileSlug}).`) }
      catch { setStatus('This wallet link could not be verified. Search again.') }
    }}>{person.name} · {person.profileSlug} · {person.address.slice(0, 12)}…</button>)}
    <p role="status">{status}</p>
  </div>
}
