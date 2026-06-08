import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { DEFAULT_POST_LOGIN_PATH } from '../../config/pidp'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { completeOAuthLogin } = useAuth()

  useEffect(() => {
    const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash
    const params = new URLSearchParams(hash || location.search)
    const token = params.get('token')
    if (token) {
      completeOAuthLogin(token)
      const queryParams = new URLSearchParams(location.search)
      const requestedNext = queryParams.get('next') || DEFAULT_POST_LOGIN_PATH
      const next = requestedNext.startsWith('/') && !requestedNext.startsWith('/auth/callback')
        ? requestedNext
        : DEFAULT_POST_LOGIN_PATH
      navigate(next, { replace: true })
      return
    }
    navigate('/users/login', { replace: true })
  }, [completeOAuthLogin, location.hash, location.search, navigate])

  return null
}
