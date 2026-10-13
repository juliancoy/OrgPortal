import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { pidpAppLoginUrl } from '../../config/pidp'
import { organizationFollowState } from './organizationFollowApi'

export function OrganizationFollowButton({ orgId, slug }: { orgId: string; slug: string }) {
  const { token } = useAuth()
  const [following, setFollowing] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const revision = useRef(0)
  useEffect(() => {
    const generation = ++revision.current
    const controller = new AbortController()
    setFollowing(null); setBusy(false); setError('')
    if (token) void organizationFollowState(orgId, token, 'GET', controller.signal)
      .then(value => { if (revision.current === generation) setFollowing(value) })
      .catch(() => { if (!controller.signal.aborted) setError('Unable to load following.') })
    return () => { ++revision.current; controller.abort() }
  }, [orgId, token, retry])
  async function toggle() {
    if (!token || following === null || busy) return
    const generation = revision.current
    setBusy(true); setError('')
    try {
      const value = await organizationFollowState(orgId, token, following ? 'DELETE' : 'PUT')
      if (revision.current === generation) setFollowing(value)
    } catch {
      if (revision.current === generation) setError('Unable to update following. Please try again.')
    } finally {
      if (revision.current === generation) setBusy(false)
    }
  }
  if (!token) return <a className="btn-secondary" href={pidpAppLoginUrl(`/orgs/${encodeURIComponent(slug)}`)}>Sign in to follow</a>
  return <div className="organization-follow-control">
    <button type="button" className="btn-secondary" disabled={busy || (following === null && !error)}
      aria-pressed={following === true} onClick={following === null ? () => setRetry(value => value + 1) : toggle}>
      {busy ? 'Saving…' : following === null ? error ? 'Retry following' : 'Loading…' : following ? 'Unfollow' : 'Follow organization'}
    </button>
    {following && <span className="muted">Following · <Link to="/following">Events feed</Link> and in-app notifications</span>}
    {error && <span role="status">{error}</span>}
  </div>
}
