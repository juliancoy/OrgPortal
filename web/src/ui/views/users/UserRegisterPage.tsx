import { getActivePortalProfileConfig, portalProfilePath } from '../../../config/portalFeatures'
import { portalPath } from '../../../config/portalBase'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { defaultPostLoginPath, normalizePostLoginPath } from '../../../config/pidp'

export function UserRegisterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const portalProfile = getActivePortalProfileConfig()
  const requestedNext = normalizePostLoginPath(searchParams.get('next') || defaultPostLoginPath())
  const loginPath = portalProfilePath(`/users/login?next=${encodeURIComponent(requestedNext)}`)
  const { registerWithPassword, isLoading, token } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [registrationComplete, setRegistrationComplete] = useState(false)
  const accountExists = Boolean(
    error &&
      (error.toLowerCase().includes('account already exists') ||
        error.toLowerCase().includes('already registered')),
  )

  useEffect(() => {
    document.title = `${portalProfile.portalTitle} • Registration`
  }, [portalProfile.portalTitle])

  useEffect(() => {
    if (!isLoading && registrationComplete && token) {
      setIsSubmitting(false)
      navigate(requestedNext)
    }
  }, [isLoading, registrationComplete, token, navigate, requestedNext])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    setError(null)
    setIsSubmitting(true)
    try {
      await registerWithPassword(email, password)
      setRegistrationComplete(true)
    } catch (err) {
      setIsSubmitting(false)
      setError(err instanceof Error ? err.message : 'Registration failed')
    }
  }

  return (
    <section className="portal-auth-page" aria-labelledby="user-register-title">
      <div className="panel portal-auth-card portal-auth-card-compact">
        <div className="portal-auth-card-header">
          {portalProfile.id === 'baltimore-medtech' && <img className="medtech-auth-logo" src={portalPath(portalProfile.brandImagePath!)} alt="" />}
          <p className="portal-auth-eyebrow">{portalProfile.id === 'baltimore-medtech' ? portalProfile.tagline : 'New account'}</p>
          <h1 id="user-register-title">{portalProfile.id === 'baltimore-medtech' ? 'Join Baltimore MedTech' : 'Register'}</h1>
          <p className="muted">{portalProfile.id === 'baltimore-medtech' ? 'One account connects you to Baltimore MedTech and the wider Code Collective community.' : 'Create a user account for the Code Collective portal.'}</p>
        </div>

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
          />
          </label>
          <label>
            <span>Password</span>
          <input
            id="pw"
            type="password"
            autoComplete="new-password"
            required
            aria-required="true"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            aria-describedby="pw-hint"
          />
          <span id="pw-hint" className="sr-only">Password must be at least 8 characters</span>
          </label>
        {error ? (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={accountExists ? 'Account already exists' : 'Registration failed'}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000,
              padding: '1.5rem',
            }}
          >
            <div
              style={{
                maxWidth: 520,
                width: '100%',
                background: '#fff1f1',
                border: '2px solid #c94c4c',
                color: '#7a1f1f',
                borderRadius: 12,
                padding: '1.25rem 1.5rem',
                boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <strong id="register-error-title" style={{ fontSize: '1.1rem' }}>
                  {accountExists ? 'Account already exists' : 'Registration failed'}
                </strong>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '1.25rem',
                    cursor: 'pointer',
                    color: '#7a1f1f',
                  }}
                  aria-label="Close error dialog"
                >
                  ×
                </button>
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                {accountExists ? (
                  <>
                    An account with this email already exists. Please log in instead.
                    <div style={{ marginTop: '0.75rem' }}>
                      <Link to={loginPath}>Go to login</Link>
                    </div>
                  </>
                ) : (
                  error
                )}
              </div>
              {!accountExists ? (
                <div style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
                  Please try again in a moment.
                </div>
              ) : null}
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  style={{
                    background: '#7a1f1f',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 0.9rem',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <button
          type="submit"
          className="btn-primary portal-auth-submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? 'Creating account...' : portalProfile.id === 'baltimore-medtech' ? 'Join Baltimore MedTech' : 'Register'}
        </button>
        </form>

        <p className="portal-auth-secondary">
          Already have a Code Collective account? <Link to={loginPath}>Login</Link>
        </p>
      </div>
    </section>
  )
}
