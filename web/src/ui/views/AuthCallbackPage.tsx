import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { DEFAULT_POST_LOGIN_PATH } from '../../config/pidp'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { refreshSession } = useAuth()

  useEffect(() => {
    refreshSession()
    const queryParams = new URLSearchParams(location.search)
    const requestedNext = queryParams.get('next') || DEFAULT_POST_LOGIN_PATH
    const next = requestedNext.startsWith('/') && !requestedNext.startsWith('/auth/callback')
      ? requestedNext
      : DEFAULT_POST_LOGIN_PATH
    navigate(next, { replace: true })
  }, [location.search, navigate, refreshSession])

  return null
}
