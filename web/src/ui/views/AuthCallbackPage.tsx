import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { defaultPostLoginPath, normalizePostLoginPath } from '../../config/pidp'
import { toInternalPortalPath } from '../../config/portalBase'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { refreshSession } = useAuth()
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const queryParams = new URLSearchParams(location.search)
    const communityId = queryParams.get('community')
    const requestedNext = communityId
      ? toInternalPortalPath(queryParams.get('next') || '/', '/')
      : normalizePostLoginPath(queryParams.get('next') || defaultPostLoginPath())
    if (communityId) {
      // Resolve the destination from admin-managed community data. Never accept
      // a caller-supplied return hostname or copy a token into the URL.
      void fetch(`/api/org/api/timebank/communities/${encodeURIComponent(communityId)}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error('This community is unavailable. Please return to its sign-in page.')
          const community = await response.json() as { id: string; hostname: string }
          if (!/^[a-z][a-z0-9-]{2,39}$/.test(community.id) || community.hostname !== `${community.id}.codecollective.us`) throw new Error('Invalid community destination.')
          if (!controller.signal.aborted) window.location.replace(`https://${community.hostname}${requestedNext}`)
        }).catch((error: unknown) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to return to your community.') })
      return () => controller.abort()
    }
    refreshSession()
    navigate(requestedNext, { replace: true })
    return () => controller.abort()
  }, [location.search, navigate, refreshSession])

  return error ? <p role="alert">{error}</p> : <p role="status">Returning to your community…</p>
}
