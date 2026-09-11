import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pidpAppLoginUrl } from '../../../config/pidp'
import { loadAttendance, recordAttendanceWithRetry, type EventAttendance } from './attendanceApi'

function RegistrantAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
  return photoUrl && !failed ? (
    <img src={photoUrl} alt={name} width={44} height={44} loading="lazy" referrerPolicy="no-referrer"
      onError={() => setFailed(true)} className="public-event-registrant-avatar" />
  ) : (
    <span aria-label={name} role="img" className="public-event-registrant-avatar public-event-registrant-initials">{initials || '?'}</span>
  )
}

function PrivateRegistrantAvatar() {
  return <span aria-label="Private registrant" role="img" title="Private registrant" className="public-event-registrant-avatar public-event-registrant-private" />
}

// The parent keys this component by event and account to reset state on navigation/sign-in.
export function EventRegistration({ eventId, slug, token, authLoading = false, saveToCalendar, organizationName }: {
  eventId: string
  slug: string
  token: string | null
  authLoading?: boolean
  saveToCalendar: () => Promise<string | undefined>
  organizationName?: string | null
}) {
  const [attendance, setAttendance] = useState<EventAttendance | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)
  const [emailUpdates, setEmailUpdates] = useState(true)
  const [organizationAnnouncements, setOrganizationAnnouncements] = useState(false)
  const next = `/events/${encodeURIComponent(slug)}`
  const privateRegistrantCount = attendance ? Math.max(0, attendance.count - attendance.attendees.length) : 0

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    loadAttendance(eventId, token).then((result) => {
      if (!cancelled) { setAttendance(result); setError('') }
    }).catch((err: Error) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [authLoading, eventId, token, reload])

  async function updateRegistration() {
    if (pending || !token || !attendance) return
    const cancelling = attendance.registered
    setPending(true)
    setError('')
    setMessage('')
    try {
      const result = await recordAttendanceWithRetry(eventId, token, cancelling ? 'DELETE' : 'POST', cancelling ? undefined : {
        email_updates: emailUpdates, organization_announcements: organizationAnnouncements,
      })
      if (!result.ok || !result.attendance) throw new Error(result.message)
      setAttendance(result.attendance)
      setMessage(result.message)
      if (!cancelling) {
        try {
          const calendarMessage = await saveToCalendar()
          if (calendarMessage) setMessage(calendarMessage)
        } catch {
          setMessage('You’re registered! Calendar sync failed; you can download the calendar event below.')
        }
      } else {
        setMessage('Registration cancelled. Remove any saved calendar copy separately.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save your registration. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="portal-card public-event-registration" aria-labelledby="event-registration-title">
      <div className="public-event-card-heading">
        <p className="public-event-eyebrow">Registration</p>
        <h2 id="event-registration-title">Reserve Your Spot</h2>
      </div>
      {attendance ? (
        <div className="public-event-attendance-summary">
          {attendance.count > 0 && (
            <div aria-label="Registrants" className="public-event-registrants">
              {attendance.attendees.map((person) => (
                <Link key={person.slug} to={`/users/${encodeURIComponent(person.slug)}`} title={person.name} className="public-event-registrant-link">
                  <RegistrantAvatar name={person.name} photoUrl={person.photo_url} />
                </Link>
              ))}
              {Array.from({ length: privateRegistrantCount }).map((_, index) => (
                <span key={`private-${index}`} className="public-event-registrant-link">
                  <PrivateRegistrantAvatar />
                </span>
              ))}
            </div>
          )}
          <div className="public-event-attendance-count">
            <strong aria-live="polite">{attendance.count}</strong>
            <span>{attendance.count === 1 ? 'registrant' : 'registrants'}</span>
            {attendance.count === 0 && <small>No registrants yet.</small>}
          </div>
        </div>
      ) : !error ? <p className="muted">Loading registrations…</p> : null}
      {token && attendance && !attendance.registered && <div className="public-event-registration-options">
        <label><input type="checkbox" disabled={pending} checked={emailUpdates} onChange={(event) => setEmailUpdates(event.target.checked)} /> <span>Email me updates about this event</span></label>
        {organizationName && <label><input type="checkbox" disabled={pending} checked={organizationAnnouncements} onChange={(event) => setOrganizationAnnouncements(event.target.checked)} /> <span>Also send me announcements from {organizationName}</span></label>}
      </div>}
      <div className="public-event-registration-actions">
        {authLoading ? (
          <div className="public-event-registration-auth-loading" role="status" aria-label="Checking sign-in status">
            <span aria-hidden="true" />
          </div>
        ) : token ? <>
          {attendance?.registered && <strong className="public-event-registered-state">You’re registered</strong>}
          <button type="button" className={attendance?.registered ? 'portal-button-secondary' : undefined}
            onClick={updateRegistration} disabled={pending || !attendance}>
            {pending ? 'Saving…' : attendance?.registered ? 'Cancel Registration' : 'Register'}
          </button>
        </> : <>
          <a className="btn-primary" href={pidpAppLoginUrl(next)}>Register</a>
        </>}
      </div>
      <p className="muted public-event-registration-note">Total registrations are counted here. Public profiles are linked; private registrants appear as gray avatars.</p>
      {token && <div className="public-event-registration-links">
        <Link to="/email/preferences" className="public-event-preferences-link">Manage email preferences</Link>
        {attendance?.registered ? <Link to="/calendar/integrations" className="public-event-preferences-link">Subscribe to registered events</Link> : null}
      </div>}
      {message && <p role="status" className="public-event-status-message">{message}</p>}
      {error && <div role="alert" className="public-event-registration-error">
        <p style={{ margin: '0 0 0.5rem' }}>{error}</p>
        <button type="button" className="portal-button-secondary" disabled={pending} onClick={() => setReload((value) => value + 1)}>Retry</button>
        {' '}<a href={pidpAppLoginUrl(next)}>Log in again</a>
      </div>}
    </section>
  )
}
