import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pidpAppLoginUrl } from '../../../config/pidp'
import { loadAttendance, recordAttendanceWithRetry, type EventAttendance } from './attendanceApi'

function RegistrantAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
  return photoUrl && !failed ? (
    <img src={photoUrl} alt={name} width={40} height={40} loading="lazy" referrerPolicy="no-referrer"
      onError={() => setFailed(true)} style={{ display: 'block', borderRadius: '50%', objectFit: 'cover' }} />
  ) : (
    <span aria-label={name} role="img" style={{ display: 'grid', placeItems: 'center', width: 40, height: 40,
      borderRadius: '50%', background: 'var(--border)', color: 'var(--text)', fontWeight: 600 }}>{initials || '?'}</span>
  )
}

// The parent keys this component by event and account to reset state on navigation/sign-in.
export function EventRegistration({ eventId, slug, token, saveToCalendar }: {
  eventId: string; slug: string; token: string | null; saveToCalendar: () => Promise<string | undefined>
}) {
  const [attendance, setAttendance] = useState<EventAttendance | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)
  const next = `/events/${encodeURIComponent(slug)}`

  useEffect(() => {
    let cancelled = false
    loadAttendance(eventId, token).then((result) => {
      if (!cancelled) { setAttendance(result); setError('') }
    }).catch((err: Error) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [eventId, token, reload])

  async function updateRegistration() {
    if (pending || !token || !attendance) return
    const cancelling = attendance.registered
    setPending(true)
    setError('')
    setMessage('')
    try {
      const result = await recordAttendanceWithRetry(eventId, token, cancelling ? 'DELETE' : 'POST')
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
    <section className="portal-card" aria-labelledby="event-registration-title" style={{ display: 'grid', gap: '0.75rem' }}>
      <h2 id="event-registration-title" style={{ margin: 0, fontSize: '1.1rem' }}>Registration</h2>
      {attendance ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {attendance.attendees.length > 0 && (
            <div aria-label="Some of the registrants" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
              {attendance.attendees.map((person) => (
                <Link key={person.slug} to={`/users/${encodeURIComponent(person.slug)}`} title={person.name}>
                  <RegistrantAvatar name={person.name} photoUrl={person.photo_url} />
                </Link>
              ))}
            </div>
          )}
          <strong aria-live="polite">{attendance.count} {attendance.count === 1 ? 'person registered' : 'people registered'}</strong>
          {attendance.count === 0 && <span className="muted">Be the first to register.</span>}
        </div>
      ) : !error ? <p className="muted" style={{ margin: 0 }}>Loading registrations…</p> : null}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {token ? <>
          {attendance?.registered && <strong>You’re registered!</strong>}
          <button type="button" className={attendance?.registered ? 'portal-button-secondary' : undefined}
            onClick={updateRegistration} disabled={pending || !attendance}>
            {pending ? 'Saving…' : attendance?.registered ? 'Cancel registration' : 'Register for event'}
          </button>
        </> : <>
          <a className="btn-primary" href={pidpAppLoginUrl(next)}>Log in to register</a>
          <Link to={`/users/register?next=${encodeURIComponent(next)}`}>Sign up</Link>
        </>}
      </div>
      <p className="muted" style={{ margin: 0 }}>Your public profile may appear with other registrants.</p>
      {message && <p role="status" style={{ margin: 0 }}>{message}</p>}
      {error && <div role="alert">
        <p style={{ margin: '0 0 0.5rem' }}>{error}</p>
        <button type="button" className="portal-button-secondary" disabled={pending} onClick={() => setReload((value) => value + 1)}>Retry</button>
        {' '}<a href={pidpAppLoginUrl(next)}>Log in again</a>
      </div>}
    </section>
  )
}
