import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { DEFAULT_POST_LOGIN_PATH } from '../../../config/pidp'

export function UserRegisterPage() {
  const navigate = useNavigate()
  const { registerWithPassword, isLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const accountExists = Boolean(
    error &&
      (error.toLowerCase().includes('account already exists') ||
        error.toLowerCase().includes('already registered')),
  )

  useEffect(() => {
    document.title = 'Org Portal • User registration'
  }, [])

  useEffect(() => {
    if (!isLoading && isSubmitting) {
      setIsSubmitting(false)
      navigate(DEFAULT_POST_LOGIN_PATH)
    }
  }, [isLoading, isSubmitting, navigate])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    setError(null)
    setIsSubmitting(true)
    try {
      await registerWithPassword(email, password)
    } catch (err) {
      setIsSubmitting(false)
      setError(err instanceof Error ? err.message : 'Registration failed')
    }
  }

  return (
    <section className="portal-auth-page" aria-labelledby="user-register-title">
      <div className="panel portal-auth-card portal-auth-card-compact">
        <div className="portal-auth-card-header">
          <p className="portal-auth-eyebrow">New account</p>
          <h1 id="user-register-title">Register</h1>
          <p className="muted">Create a user account for the Code Collective portal.</p>
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
                      <Link to="/users/login">Go to login</Link>
                    </div>
                  </>
                ) : (
                  error
                )}
              </div>
              {!accountExists ? (
                <div style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
                  Check that the PIdP service is reachable at <code>/pidp</code>.
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
          {isSubmitting ? 'Creating account...' : 'Register'}
        </button>
        </form>

        <p className="portal-auth-secondary">
          Already have an account? <Link to="/users/login">Login</Link>
        </p>
      </div>
    </section>
  )
}
