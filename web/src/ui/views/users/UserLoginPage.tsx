import { useEffect, useState } from 'react'
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

  const handleSubmit = async () => {
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
    <section className="panel">
      <h1 style={{ marginTop: 0 }}>Login (user)</h1>
      <div
        style={{ display: 'grid', gap: '0.6rem' }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          if (isSubmitting || isLoading) return
          const target = event.target as HTMLElement | null
          if (target && (target.tagName === 'TEXTAREA' || target.isContentEditable)) return
          event.preventDefault()
          handleSubmit()
        }}
      >
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <p className="muted" style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
            Sign in or register with your Code Collective identity
          </p>
          <div className="portal-guest-login-actions" aria-label="Sign in or register options">
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
              className="portal-social-login-button"
              aria-label="Register new account"
              style={{
                display: 'inline-flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '0.5rem',
                border: '1px solid var(--border-input)',
                borderRadius: 8,
                padding: '0.6rem 1rem',
                textDecoration: 'none',
                color: 'inherit',
                fontSize: '0.9rem',
                fontWeight: 600,
              }}
            >
              Register
            </Link>
          </div>
          <a
            href={pidpAppLoginUrl(nextUrl)}
            style={{
              display: 'inline-flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '0.5rem',
              border: '1px solid var(--border-input)',
              borderRadius: 8,
              padding: '0.6rem 1rem',
              textDecoration: 'none',
              backgroundColor: 'var(--primary)',
              color: '#fff',
            }}
          >
            Continue to Identity Provider
          </a>
        </div>
        <div className="muted" style={{ textAlign: 'center' }}>
          or
        </div>
        <div>
          <label className="muted" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            aria-required="true"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%' }}
            aria-describedby={error ? 'user-login-error' : undefined}
          />
        </div>
        <div>
          <label className="muted" htmlFor="pw">
            Password
          </label>
          <input
            id="pw"
            type="password"
            autoComplete="current-password"
            required
            aria-required="true"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%' }}
            aria-describedby={error ? 'user-login-error' : undefined}
          />
        </div>
        {error ? (
          <p id="user-login-error" className="muted" role="alert" aria-live="polite" style={{ color: 'var(--text-danger)', marginBottom: 0 }}>
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={isSubmitting || isLoading}
          aria-busy={isSubmitting || isLoading}
          onClick={handleSubmit}
        >
          {isSubmitting || isLoading ? 'Signing in...' : 'Login'}
        </button>
        <p className="muted" style={{ marginBottom: 0 }}>
          New here? <Link to="/users/register">Register</Link>
        </p>
      </div>
    </section>
  )
}
