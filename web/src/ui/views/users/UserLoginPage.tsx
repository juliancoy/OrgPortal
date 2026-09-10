import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { portalPath } from '../../../config/portalBase'
import { defaultPostLoginPath, PIDP_APP_SLUG, normalizePostLoginPath, pidpAppLoginUrl, pidpUrl, portalAuthCallbackUrl } from '../../../config/pidp'
import { getActivePortalProfileConfig, portalProfilePath } from '../../../config/portalFeatures'

export function UserLoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { loginWithPassword, isLoading, role } = useAuth()
  const portalProfile = getActivePortalProfileConfig()
  const tenantAuth = Boolean(portalProfile.tenantId)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const requestedNext = normalizePostLoginPath(searchParams.get('next') || defaultPostLoginPath())
  const registerPath = portalProfilePath(`/users/register?next=${encodeURIComponent(requestedNext)}`)
  const socialLoginUrl = (provider: 'google' | 'github') => {
    const params = new URLSearchParams({ next: portalAuthCallbackUrl(requestedNext) })
    if (PIDP_APP_SLUG) params.set('app', PIDP_APP_SLUG)
    return pidpUrl(`/auth/${provider}/login?${params.toString()}`)
  }

  useEffect(() => {
    document.title = `${portalProfile.portalTitle} • User login`
  }, [portalProfile.portalTitle])

  useEffect(() => {
    if (!isLoading && role !== 'guest') {
      setIsSubmitting(false)
      navigate(requestedNext)
    }
  }, [isLoading, isSubmitting, role, navigate, requestedNext])

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
          {tenantAuth && portalProfile.brandImagePath && <img className="tenant-auth-logo" src={portalPath(portalProfile.brandImagePath)} alt="" />}
          <p className="portal-auth-eyebrow">{tenantAuth ? portalProfile.tagline : `${portalProfile.brandName} identity`}</p>
          <h1 id="user-login-title">{tenantAuth ? `Welcome to ${portalProfile.brandName}` : 'Log In'}</h1>
          <p className="muted">{tenantAuth ? `Sign in to continue to ${portalProfile.brandName}.` : 'Sign in with your existing account or create one before continuing.'}</p>
        </div>

        <div className="portal-auth-provider-stack">
          <div className="portal-guest-login-actions portal-auth-provider-actions" aria-label="Sign in or register options">
            <a
              href={socialLoginUrl('google')}
              className="portal-social-login-button"
              aria-label="Continue with Google"
            >
              <img src={portalPath('/images/google-g-logo.svg')} alt="" className="portal-social-login-logo" />
            </a>
            <a
              href={socialLoginUrl('github')}
              className="portal-social-login-button"
              aria-label="Continue with GitHub"
            >
              <img src={portalPath('/images/github-mark.svg')} alt="" className="portal-social-login-logo" />
            </a>
            <Link
              to={registerPath}
              className="portal-social-login-button portal-auth-register-shortcut"
              aria-label="Register new account"
            >
              Register
            </Link>
          </div>
          <a
            href={pidpAppLoginUrl(requestedNext)}
            className="portal-button portal-auth-idp-link"
          >
            {tenantAuth ? 'Continue with Code Collective' : 'Continue to Identity Provider'}
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
            {isSubmitting ? 'Signing in...' : 'Login'}
          </button>
        </form>

        <p className="portal-auth-secondary">
          New here? <Link to={registerPath}>{tenantAuth ? `Join ${portalProfile.brandName}` : 'Register'}</Link>
        </p>
        {tenantAuth && <p className="tenant-shared-account">Your existing Code Collective account works here.</p>}
      </div>
    </section>
  )
}
