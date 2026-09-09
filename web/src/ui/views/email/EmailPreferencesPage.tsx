import { useEffect, useState } from 'react'
import { useAuth } from '../../../app/AppProviders'
import { emailApi } from './emailApi'

type Subscription = { id: string; topic_name: string | null; topic_type: string; status: string }
export function EmailPreferencesPage() {
  const { token } = useAuth()
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    emailApi<Subscription[]>(token, '/subscriptions/me').then((data) => { if (!cancelled) setSubscriptions(data) })
      .catch((err: Error) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [token])
  return <section className="panel"><h1>Email preferences</h1><p>Choose which event updates and organization announcements you receive.</p>
    {error && <p role="alert">{error}</p>}
    {!subscriptions && !error && <p>Loading email preferences…</p>}
    {subscriptions?.length === 0 && <p>No subscriptions yet. You can opt in when registering for an event.</p>}
    {subscriptions?.map((subscription) => <label key={subscription.id} className="portal-card" style={{ display: 'flex', gap: '.75rem', marginBottom: '.75rem', alignItems: 'center' }}>
      <input type="checkbox" checked={subscription.status === 'subscribed'} disabled={Boolean(pending)} onChange={async (event) => {
        const subscribed = event.target.checked
        setPending(subscription.id); setError('')
        try {
          await emailApi(token, `/subscriptions/${subscription.id}`, 'PUT', { subscribed })
          setSubscriptions((items) => items?.map((item) => item.id === subscription.id ? { ...item, status: subscribed ? 'subscribed' : 'unsubscribed' } : item) || [])
        } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save preference.') } finally { setPending(null) }
      }} /><span>{subscription.topic_name || 'Unavailable event or organization'}<br /><span className="muted">{subscription.topic_type === 'event' ? 'Event updates' : 'Organization announcements'}</span></span>
    </label>)}
  </section>
}
