import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { pidpAppLoginUrl } from '../../../config/pidp'

export function OrgLoginPage() {
  const navigate = useNavigate()
  const { loginWithPassword, isLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const nextUrl = window.location.href
  const socialLoginUrl = (provider: 'google' | 'github') =>
    `/api/org/auth/social/${provider}/login?next=${encodeURIComponent(nextUrl)}`

  useEffect(() => {
    document.title = 'Org Portal • Org login'
  }, [])

  useEffect(() => {
    if (!isLoading && isSubmitting) {
      setIsSubmitting(false)
      navigate('/orgs/initiatives')
    }
  }, [isLoading, isSubmitting, navigate])

  return (
    <section className="panel">
      <h1 style={{ marginTop: 0 }}>Login (org)</h1>
      <div style={{ display: 'grid', gap: '0.6rem' }}>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <a
            href={socialLoginUrl('google')}
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
            }}
          >
            Continue with Google
          </a>
          <a
            href={socialLoginUrl('github')}
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
            }}
          >
            Continue with GitHub
          </a>
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
              color: 'inherit',
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
          <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div>
          <label className="muted" htmlFor="pw">
            Password
          </label>
          <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%' }} />
        </div>
        {error ? (
          <p className="muted" role="alert" style={{ color: 'var(--text-danger)', marginBottom: 0 }}>
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={isSubmitting || isLoading}
          onClick={async () => {
            setError(null)
            setIsSubmitting(true)
            try {
              await loginWithPassword(email, password)
            } catch (err) {
              setIsSubmitting(false)
              setError(err instanceof Error ? err.message : 'Login failed')
            }
          }}
        >
          {isSubmitting || isLoading ? 'Signing in...' : 'Login'}
        </button>
        <p className="muted" style={{ marginBottom: 0 }}>
          New organization? <Link to="/orgs/register">Register</Link>
        </p>
      </div>
    </section>
  )
}
