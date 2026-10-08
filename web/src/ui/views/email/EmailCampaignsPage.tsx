import { useEffect, useState } from 'react'
import { useAuth } from '../../../app/AppProviders'
import { emailApi, type CampaignPreview, type CampaignSummary, type EmailAudience, type EmailSender } from './emailApi'
import './emailCampaigns.css'

type EventChoice = { id: string; title: string; host_org_id?: string | null; host_type?: string; organization_name?: string }
const initialBody = 'Hi {{first_name}},\n\nJoin us for {{event_title}}. We’d love to see you there!\n\n{{organization}}'
const date = (value: number) => new Date(value).toLocaleString()

export function EmailCampaignsPage() {
  const { token } = useAuth()
  const [sender, setSender] = useState<EmailSender | null>(null)
  const [events, setEvents] = useState<EventChoice[]>([])
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [eventId, setEventId] = useState('')
  const [audience, setAudience] = useState('event')
  const [audienceInfo, setAudienceInfo] = useState<EmailAudience | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [subject, setSubject] = useState('You’re invited: {{event_title}}')
  const [body, setBody] = useState(initialBody)
  const [schedule, setSchedule] = useState('')
  const [preview, setPreview] = useState<CampaignPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function refresh() {
    const [nextSender, nextCampaigns] = await Promise.all([
      emailApi<EmailSender>(token, '/sender'), emailApi<CampaignSummary[]>(token, '/campaigns'),
    ])
    setSender(nextSender); setCampaigns(nextCampaigns)
  }
  useEffect(() => {
    let cancelled = false
    Promise.all([emailApi<EmailSender>(token, '/sender'), emailApi<CampaignSummary[]>(token, '/campaigns'),
      fetch('/api/org/api/network/events?limit=500', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then(async (response) => { if (!response.ok) throw new Error('Unable to load events.'); return response.json() as Promise<EventChoice[]> })])
      .then(([nextSender, nextCampaigns, nextEvents]) => {
        if (cancelled) return
        setSender(nextSender); setCampaigns(nextCampaigns); setEvents(nextEvents.filter((event) => event.host_org_id))
      }).catch((err: Error) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [token])
  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    emailApi<EmailAudience>(token, `/audience/${encodeURIComponent(eventId)}`).then((data) => { if (!cancelled) setAudienceInfo(data) })
      .catch((err: Error) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [eventId, token])

  async function act(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { await action() } catch (err) { setError(err instanceof Error ? err.message : 'Please try again.') } finally { setBusy(false) }
  }
  function changed() { setPreview(null); setMessage('') }
  async function openCampaign(id: string) { setPreview(await emailApi<CampaignPreview>(token, `/campaigns/${id}`)) }
  const recipientCount = audience === 'event' ? audienceInfo?.event_count : audience === 'organization' ? audienceInfo?.organization_count : selected.length

  return <main className="panel email-campaigns">
    <div className="email-heading"><div><h1>Email campaigns</h1><p className="muted">Invite your community and keep event registrants updated.</p></div>
      <button className="portal-button-secondary" disabled={busy} onClick={() => void act(async () => { await refresh(); if (preview) await openCampaign(preview.id) })}>Refresh status</button></div>
    {error && <p role="alert" className="email-notice">{error}</p>}
    {message && <p role="status" className="email-notice">{message}</p>}
    <section className="portal-card email-sender" aria-label="Email sender">
      <div><h2>Sender</h2><strong>{sender?.email || 'Loading sender…'}</strong>
        {sender && <p className="muted">{sender.connected ? 'Google account connected' : sender.status === 'reconnect' ? 'Reconnect your Google account to continue sending' : 'Connect Google Workspace to send email'}</p>}
        {sender?.connected && <p>{sender.used_today} of {sender.daily_limit} portal sends used in the last 24 hours.</p>}
        {sender?.connected && <p className="muted">Your regular Gmail messages also count toward Google’s sending limits.</p>}
        {sender && sender.cooldown_until > Date.now() && <p>Google requested a pause until {date(sender.cooldown_until)}.</p>}
        {sender && !sender.configured && <p>Google email setup must be completed by the portal administrator.</p>}
        {sender?.configured && !sender.sending_enabled && <p>Sending is disabled. You can connect your account and prepare previews.</p>}
      </div>
      <div className="email-actions">
        <button disabled={busy || !sender?.configured} onClick={() => void act(async () => {
          const result = await emailApi<{ url: string }>(token, '/google/connect', 'POST')
          const url = new URL(result.url)
          if (url.origin !== 'https://accounts.google.com') throw new Error('Unexpected Google sign-in address.')
          window.location.assign(url.toString())
        })}>{sender?.connected ? 'Reconnect Google' : 'Connect Google Workspace'}</button>
        {sender?.connected && <button className="portal-button-secondary" disabled={busy} onClick={() => void act(async () => {
          await emailApi(token, '/sender', 'DELETE'); await refresh(); setMessage('Sender disconnected. Queued campaigns are paused.')
        })}>Disconnect sender</button>}
      </div>
    </section>

    <section className="portal-card email-compose">
      <h2>Compose an event email</h2>
      <label>Event<select value={eventId} disabled={busy} onChange={(e) => { changed(); setEventId(e.target.value); setSelected([]); setAudienceInfo(null) }}>
        <option value="">Choose an organization-hosted event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
      </select></label>
      <label>Audience<select value={audience} disabled={busy} onChange={(e) => { changed(); setAudience(e.target.value) }}>
        <option value="event">Subscribers to this event’s updates</option><option value="organization">Organization announcement subscribers</option><option value="selected">Selected organization subscribers</option>
      </select></label>
      {eventId && audienceInfo && <p>{recipientCount || 0} subscribed recipients. {audience === 'event' ? 'Use this audience for updates about the selected event.' : 'Only people who opted in to organization announcements are included.'}</p>}
      {audience === 'selected' && audienceInfo && <fieldset className="email-contact-list"><legend>Select recipients</legend>
        {audienceInfo.contacts.length === 0 ? <p>No organization subscribers yet.</p> : audienceInfo.contacts.map((person) => <label key={person.id} className="email-checkbox">
          <input type="checkbox" checked={selected.includes(person.id)} disabled={busy} onChange={(e) => { changed(); setSelected(e.target.checked ? [...selected, person.id] : selected.filter((id) => id !== person.id)) }} />
          <span>{person.name} — {person.email}</span></label>)}
      </fieldset>}
      <label>Subject<input value={subject} maxLength={200} disabled={busy} onChange={(e) => { changed(); setSubject(e.target.value) }} /></label>
      <label>Message<textarea rows={8} value={body} maxLength={20000} disabled={busy} onChange={(e) => { changed(); setBody(e.target.value) }} /></label>
      <p className="muted">Personalize with {'{{first_name}}'}, {'{{event_title}}'}, or {'{{organization}}'}. Event details and a registration button are added automatically.</p>
      <label>Schedule (optional, your local time)<input type="datetime-local" value={schedule} disabled={busy} onChange={(e) => { changed(); setSchedule(e.target.value) }} /></label>
      <div className="email-actions"><button disabled={busy || !sender?.connected || !sender.configured || !eventId || !subject.trim() || !body.trim()} onClick={() => void act(async () => {
        const draft = await emailApi<CampaignPreview>(token, '/campaigns', 'POST', { event_id: eventId, audience, selected_ids: selected, subject, body,
          scheduled_at: schedule ? new Date(schedule).toISOString() : null })
        setPreview(draft); await refresh(); setMessage('Draft saved. Review the email and recipients below.')
      })}>{busy ? 'Working…' : 'Save draft & preview'}</button></div>
    </section>

    {preview && <section className="portal-card email-preview">
      <div className="email-heading"><h2>{preview.status === 'draft' ? 'Review your campaign' : 'Campaign status'}</h2><span>{preview.status}</span></div>
      <p><strong>From:</strong> {preview.sender_email}<br /><strong>Subject:</strong> {preview.preview.subject}<br />
        <strong>Audience:</strong> {preview.recipient_count} subscribed recipients<br /><strong>Send time:</strong> {preview.scheduled_at > Date.now() ? date(preview.scheduled_at) : 'As soon as queued'}</p>
      <p className="muted">Example personalized for Alex. Each recipient receives an individual email and their unsubscribe link.</p>
      <iframe title="Email preview" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.preview.html} />
      <div className="email-actions">
        <button className="portal-button-secondary" disabled={busy || !sender?.sending_enabled || !sender.connected} onClick={() => void act(async () => {
          const result = await emailApi<{ recipient: string }>(token, `/campaigns/${preview.id}/test`, 'POST')
          setMessage(`Test queued for ${result.recipient}. Check status after the next minute.`); await openCampaign(preview.id)
        })}>Send test to myself</button>
        {preview.status === 'draft' && <button disabled={busy || !sender?.sending_enabled || !sender.connected || !preview.recipient_count} onClick={() => void act(async () => {
          await emailApi(token, `/campaigns/${preview.id}/send`, 'POST', { fingerprint: preview.fingerprint }); await openCampaign(preview.id); await refresh()
          setMessage('Campaign queued. You can follow its progress or pause it below.')
        })}>{preview.scheduled_at > Date.now() ? 'Schedule' : 'Send'} to {preview.recipient_count} recipients</button>}
        {['queued', 'paused'].includes(preview.status) && <button className="portal-button-secondary" disabled={busy} onClick={() => void act(async () => {
          await emailApi(token, `/campaigns/${preview.id}/${preview.status === 'queued' ? 'pause' : 'resume'}`, 'POST'); await openCampaign(preview.id); await refresh()
        })}>{preview.status === 'queued' ? 'Pause campaign' : 'Resume campaign'}</button>}
      </div>
      {preview.status !== 'draft' && <p>{Object.entries(preview.counts).map(([state, count]) => `${count} ${state}`).join(' · ')}. Sent means Gmail accepted the email.</p>}
      <details><summary>Recipients and delivery history ({preview.deliveries.length})</summary><div className="email-table"><table><thead><tr><th>Recipient</th><th>Type</th><th>Status</th><th>Details</th></tr></thead><tbody>
        {preview.deliveries.map((delivery) => <tr key={delivery.id}><td>{delivery.name}<br />{delivery.email}</td><td>{delivery.kind}</td><td>{delivery.status}</td><td>{delivery.error || (delivery.gmail_message_id ? 'Accepted by Gmail' : '—')}</td></tr>)}
      </tbody></table></div></details>
    </section>}

    <section className="portal-card"><h2>Campaign history</h2>
      {campaigns.length === 0 ? <p className="muted">Your drafts and sent campaigns will appear here.</p> : <div className="email-table"><table><thead><tr><th>Campaign</th><th>Status</th><th>Sent</th><th>Created</th><th /></tr></thead><tbody>
        {campaigns.map((campaign) => <tr key={campaign.id}><td>{campaign.subject}</td><td>{campaign.status}</td><td>{campaign.sent_count} / {campaign.recipient_count}</td><td>{date(campaign.created_at)}</td><td><button className="portal-button-secondary" disabled={busy} onClick={() => void act(() => openCampaign(campaign.id))}>View</button></td></tr>)}
      </tbody></table></div>}
    </section>
  </main>
}
