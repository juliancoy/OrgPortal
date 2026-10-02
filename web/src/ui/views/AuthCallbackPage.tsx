import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { defaultPostLoginPath, normalizePostLoginPath } from '../../config/pidp'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { refreshSession } = useAuth()
  useEffect(() => {
    const query = new URLSearchParams(location.search)
    const next = normalizePostLoginPath(query.get('next') || defaultPostLoginPath())
    refreshSession()
    navigate(next, { replace: true })
  }, [location.search, navigate, refreshSession])
  return <p role="status">Completing sign-in…</p>
}
