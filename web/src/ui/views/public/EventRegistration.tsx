import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { pidpAppLoginUrl } from '../../../config/pidp'
import { loadAttendance, recordAttendanceWithRetry, type EventAttendance } from './attendanceApi'

function RegistrantAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
  return photoUrl && !failed ? (
    <img src={photoUrl} alt="" width={44} height={44} loading="lazy" referrerPolicy="no-referrer"
      onError={() => setFailed(true)} className="public-event-registrant-avatar" />
  ) : (
    <span aria-hidden="true" className="public-event-registrant-avatar public-event-registrant-initials">{initials || '?'}</span>
  )
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
  const [guestListOpen, setGuestListOpen] = useState(false)
  const guestListTitleId = useId()
  const next = `/events/${encodeURIComponent(slug)}`
  const visibleAttendees = attendance?.attendees.slice(0, 5) || []
  const hiddenAttendeeCount = attendance ? Math.max(0, attendance.count - visibleAttendees.length) : 0

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    loadAttendance(eventId, token).then((result) => {
      if (!cancelled) { setAttendance(result); setError('') }
    }).catch((err: Error) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [authLoading, eventId, token, reload])

  useEffect(() => {
    if (!guestListOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGuestListOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [guestListOpen])

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

  const registrationActions = (
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
  )

  const attendeeSummaryText = attendance
    ? attendance.count === 1 ? '1 coming' : `${attendance.count} coming`
    : 'Loading guests'

  return (
    <section className="portal-card public-event-registration" aria-labelledby="event-registration-title">
      <div className="public-event-registration-top">
        <div className="public-event-card-heading">
          <p className="public-event-eyebrow">Registration</p>
          <h2 id="event-registration-title">Reserve Your Spot</h2>
        </div>
        {registrationActions}
      </div>
      {attendance ? (
        <div className="public-event-attendance-summary">
          <button
            type="button"
            className="public-event-attendance-button"
            onClick={() => token && attendance.count > 0 ? setGuestListOpen(true) : undefined}
            disabled={!token || attendance.count === 0}
            aria-haspopup={token && attendance.count > 0 ? 'dialog' : undefined}
            aria-expanded={token && attendance.count > 0 ? guestListOpen : undefined}
          >
            <span aria-label="Event attendees" className="public-event-registrants">
              {visibleAttendees.map((person, index) => (
                <span
                  key={person.user_id || `${person.slug || 'registrant'}-${index}`}
                  className="public-event-registrant"
                  aria-hidden="true"
                >
                  <RegistrantAvatar name={person.name} photoUrl={person.photo_url} />
                </span>
              ))}
              {hiddenAttendeeCount > 0 ? <span className="public-event-registrant-more" aria-hidden="true">+{hiddenAttendeeCount}</span> : null}
            </span>
            <span className="public-event-attendance-count" aria-live="polite">
              <strong>{attendeeSummaryText}</strong>
              {token && attendance.count > 0 ? <small>View guests</small> : !token && attendance.count > 0 ? <small>Login to view guests</small> : <small>No guests yet</small>}
            </span>
          </button>
        </div>
      ) : !error ? <p className="muted">Loading registrations…</p> : null}
      {token && attendance && !attendance.registered && <div className="public-event-registration-options">
        <label><input type="checkbox" disabled={pending} checked={emailUpdates} onChange={(event) => setEmailUpdates(event.target.checked)} /> <span>Email me updates about this event</span></label>
        {organizationName && <label><input type="checkbox" disabled={pending} checked={organizationAnnouncements} onChange={(event) => setOrganizationAnnouncements(event.target.checked)} /> <span>Also send me announcements from {organizationName}</span></label>}
      </div>}
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
      {token && attendance && guestListOpen ? (
        <div className="public-event-guest-list-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setGuestListOpen(false)
        }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={guestListTitleId}
            className="portal-card public-event-guest-list-dialog"
          >
            <div className="public-event-guest-list-header">
              <div>
                <p className="public-event-eyebrow">Guests</p>
                <h3 id={guestListTitleId}>{attendeeSummaryText}</h3>
              </div>
              <button type="button" className="portal-button-secondary" onClick={() => setGuestListOpen(false)}>Close</button>
            </div>
            <div className="public-event-guest-list" aria-label="Guest list">
              {attendance.attendees.map((person, index) => {
                const profileUrl = person.profile_url || (person.slug ? `/users/${encodeURIComponent(person.slug)}` : null)
                return (
                  <div className="public-event-guest-list-item" key={person.user_id || `${person.slug || 'registrant'}-${index}`}>
                    <RegistrantAvatar name={person.name} photoUrl={person.photo_url} />
                    <div>
                      {profileUrl ? <Link to={profileUrl} onClick={() => setGuestListOpen(false)}>{person.name}</Link> : <strong>{person.name}</strong>}
                      <small>Guest</small>
                    </div>
                    <Link
                      to={`/chat?start=dm&userId=${encodeURIComponent(person.user_id)}&name=${encodeURIComponent(person.name)}`}
                      className="public-event-registrant-message"
                      onClick={() => setGuestListOpen(false)}
                    >
                      Message
                    </Link>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}
