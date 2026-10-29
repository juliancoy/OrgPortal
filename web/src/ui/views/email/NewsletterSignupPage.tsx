import { useEffect, useState, type FormEvent } from 'react'
import { subscribeToNewsletter } from '../../../data/newsletterSignup'
import { Link, useParams } from 'react-router-dom'
import { loadPublicOrganization, type PublicOrganizationRecord } from '../../../data/publicOrganization/organizations'

export function NewsletterSignupPage() {
  const { handle = '' } = useParams()
  return <OrganizationNewsletterSignup key={handle} handle={handle} />
}

function OrganizationNewsletterSignup({handle}: {handle: string}) {
  const [org, setOrg] = useState<PublicOrganizationRecord | null>(null)
  const [email, setEmail] = useState(''), [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setOrg(null); setEmail(''); setConsent(false); setMessage(''); setError('')
    loadPublicOrganization(handle, {signal: controller.signal}).then(value => { if (!controller.signal.aborted) setOrg(value) }).catch(() => {
      if (!controller.signal.aborted) setError('Unable to load this organization. Please try again.')
    })
    return () => controller.abort()
  }, [handle])
  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!org || busy || !consent) return
    setBusy(true); setError(''); setMessage('')
    try {
      const message = await subscribeToNewsletter(org.id, email)
      setMessage(message); setEmail(''); setConsent(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to subscribe. Please try again.') }
    finally { setBusy(false) }
  }
  return <section className="portal-card newsletter-signup" aria-labelledby="newsletter-title">
    <h1 id="newsletter-title">{org ? `Join ${org.name}’s mailing list` : 'Mailing-list signup'}</h1>
    <p>News and announcements by email. No account or membership required.</p>
    {error && <p role="alert">{error}</p>}
    {!org && !error && <p role="status">Loading organization…</p>}
    {org && <form onSubmit={event => void subscribe(event)}>
      <label>Email address<input type="email" name="email" autoComplete="email" maxLength={254} required value={email} disabled={busy} onChange={event => setEmail(event.target.value)}/></label>
      <label className="newsletter-consent"><input type="checkbox" required checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)}/> I agree to receive emails from {org.name}. I can unsubscribe using the link in each email.</label>
      <p><a href="/api/org/privacy">Privacy policy</a></p>
      <button className="btn-primary" type="submit" disabled={busy || !consent}>{busy ? 'Subscribing…' : 'Subscribe'}</button>
      <p role="status" aria-live="polite">{message}</p>
      <Link to={`/orgs/${encodeURIComponent(org.slug)}`}>Back to {org.name}</Link>
    </form>}
  </section>
}
