import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { DEFAULT_POST_LOGIN_PATH, PIDP_APP_SLUG, pidpAppLoginUrl, pidpUrl, portalAuthCallbackUrl } from '../../../config/pidp'

export function UserLoginPage() {
  const navigate = useNavigate()
  const { loginWithPassword, isLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const nextUrl = window.location.href
  const socialLoginUrl = (provider: 'google' | 'github') => {
    const params = new URLSearchParams({ next: portalAuthCallbackUrl(DEFAULT_POST_LOGIN_PATH) })
    if (PIDP_APP_SLUG) params.set('app', PIDP_APP_SLUG)
    return pidpUrl(`/auth/${provider}/login?${params.toString()}`)
  }

  useEffect(() => {
    document.title = 'Org Portal • User login'
  }, [])

  useEffect(() => {
    if (!isLoading && isSubmitting) {
      setIsSubmitting(false)
      navigate(DEFAULT_POST_LOGIN_PATH)
    }
  }, [isLoading, isSubmitting, navigate])

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (isSubmitting) return
    setError(null)
    setIsSubmitting(true)
    try {
      await loginWithPassword(email, password)
    } catch (err) {
      setIsSubmitting(false)
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  return (
    <section className="portal-auth-page" aria-labelledby="user-login-title">
      <div className="panel portal-auth-card">
        <div className="portal-auth-card-header">
          <p className="portal-auth-eyebrow">Code Collective identity</p>
          <h1 id="user-login-title">Log In</h1>
          <p className="muted">Sign in with your existing account or create one before continuing.</p>
        </div>

        <div className="portal-auth-provider-stack">
          <div className="portal-guest-login-actions portal-auth-provider-actions" aria-label="Sign in or register options">
            <a
              href={socialLoginUrl('google')}
              className="portal-social-login-button"
              aria-label="Continue with Google"
            >
              <img src="/images/google-g-logo.svg" alt="" className="portal-social-login-logo" />
            </a>
            <a
              href={socialLoginUrl('github')}
              className="portal-social-login-button"
              aria-label="Continue with GitHub"
            >
              <img src="/images/github-mark.svg" alt="" className="portal-social-login-logo" />
            </a>
            <Link
              to="/users/register"
              className="portal-social-login-button portal-auth-register-shortcut"
              aria-label="Register new account"
            >
              Register
            </Link>
          </div>
          <a
            href={pidpAppLoginUrl(nextUrl)}
            className="portal-button portal-auth-idp-link"
          >
            Continue to Identity Provider
          </a>
        </div>

        <div className="portal-auth-divider"><span>or use email</span></div>

        <form className="portal-auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              aria-required="true"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={error ? 'user-login-error' : undefined}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              id="pw"
              type="password"
              autoComplete="current-password"
              required
              aria-required="true"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={error ? 'user-login-error' : undefined}
            />
          </label>
          {error ? (
            <p id="user-login-error" className="portal-auth-error" role="alert" aria-live="polite">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn-primary portal-auth-submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Log In'}
          </button>
        </form>

        <p className="portal-auth-secondary">
          New here? <Link to="/users/register">Register</Link>
        </p>
      </div>
    </section>
  )
}
