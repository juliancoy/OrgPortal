import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, useServices } from './app/AppProviders'
import { Header } from './ui/shell/Header'
import { Footer } from './ui/shell/Footer'
import { DEFAULT_POST_LOGIN_PATH, PIDP_APP_SLUG, pidpAppLoginUrl, pidpUrl, portalAuthCallbackUrl } from './config/pidp'
import { listMotions } from './application/usecases/listMotions'
import { MotionStatusBadge } from './ui/components/governance/MotionStatusBadge'
import type { VoteDirection } from './domain/motion/Motion'
import type { RankedMotion } from './application/ports/EngagementRepository'

function getGuestId(): string {
  const key = 'governance.guestId'
  let id = localStorage.getItem(key)
  if (!id) {
    id = `guest_${Math.random().toString(36).slice(2)}`
    localStorage.setItem(key, id)
  }
  return id
}

function timeAgo(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d`
  return new Date(isoDate).toLocaleDateString()
}

function motionProposerLabel(motion: { proposerType?: string; proposerName: string }) {
  if (motion.proposerType === 'org') {
    return `Org: ${motion.proposerName}`
  }
  return motion.proposerName
}

export default function App() {
  const { user, role, loginWithPassword, isLoading: sessionLoading } = useAuth()
  const { motionRepository, engagementRepository } = useServices()
  const nextUrl = window.location.href
  const isGuest = role === 'guest'
  const effectiveUserId = user?.id ?? getGuestId()

  const [ranked, setRanked] = useState<RankedMotion[]>([])
  const [userVotes, setUserVotes] = useState<Record<string, VoteDirection | null>>({})
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false)

  const socialLoginUrl = (provider: 'google' | 'github') => {
    const params = new URLSearchParams({ next: portalAuthCallbackUrl(DEFAULT_POST_LOGIN_PATH) })
    if (PIDP_APP_SLUG) params.set('app', PIDP_APP_SLUG)
    return pidpUrl(`/auth/${provider}/login?${params.toString()}`)
  }

  useEffect(() => {
    document.title = isGuest ? 'Org Portal' : 'Code Collective'
  }, [isGuest])

  useEffect(() => {
    if (isGuest) {
      setLoading(false)
      setRanked([])
      setUserVotes({})
      return
    }

    setLoading(true)
    listMotions(motionRepository).then(async (motions) => {
      const rankedMotions = await engagementRepository.rankMotions(motions, effectiveUserId)
      setRanked(rankedMotions)
      setLoading(false)

      const pairs = await Promise.all(
        rankedMotions.map((m) =>
          engagementRepository.getUserVote(m.id, effectiveUserId).then((dir) => [m.id, dir] as const),
        ),
      )
      const map: Record<string, VoteDirection | null> = {}
      for (const [id, dir] of pairs) map[id] = dir
      setUserVotes(map)
    })
  }, [isGuest, motionRepository, engagementRepository, effectiveUserId])

  async function handleVote(motionId: string, direction: 'up' | 'down', e: React.MouseEvent) {
    e.stopPropagation()
    const result =
      direction === 'up'
        ? await engagementRepository.upvote(motionId, effectiveUserId)
        : await engagementRepository.downvote(motionId, effectiveUserId)
    setRanked((prev) =>
      prev.map((m) => {
        if (m.id !== motionId) return m
        const oldDir = userVotes[motionId]
        const vc = { ...m.voteCounts }
        if (oldDir === 'up') vc.up--
        else if (oldDir === 'down') vc.down--
        if (result.userVote === 'up') vc.up++
        else if (result.userVote === 'down') vc.down++
        vc.score = vc.up - vc.down
        return { ...m, score: result.score, voteCounts: vc }
      }),
    )
    setUserVotes((prev) => ({ ...prev, [motionId]: result.userVote }))
  }

  async function handlePasswordLogin() {
    if (isSubmittingLogin || sessionLoading) return
    setLoginError(null)
    setIsSubmittingLogin(true)
    try {
      await loginWithPassword(email, password)
    } catch (err) {
      setIsSubmittingLogin(false)
      setLoginError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  if (isGuest) {
    return (
      <main
        id="main-content"
        className="portal-guest-main"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem 1rem',
          background: 'var(--body-bg)',
        }}
      >
        <section
          className="panel portal-guest-panel"
          aria-labelledby="portal-guest-title"
        >
          <div className="portal-guest-brand">
            <img
              src="/images/namebanner.png"
              alt="Code Collective"
            />
            <div>
              <h1 id="portal-guest-title">Org Portal</h1>
              <p className="muted">
                Coding a New Economy
              </p>
            </div>
          </div>

          <div
            className="portal-guest-login"
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              if (isSubmittingLogin || sessionLoading) return
              const target = event.target as HTMLElement | null
              if (target && (target.tagName === 'TEXTAREA' || target.isContentEditable)) return
              event.preventDefault()
              void handlePasswordLogin()
            }}
          >
            <div className="portal-guest-login-actions" aria-label="Sign in or register options">
              <a href={socialLoginUrl('google')} className="portal-social-login-button" aria-label="Continue with Google">
                <img src="/images/google-g-logo.svg" alt="" className="portal-social-login-logo" />
              </a>
              <a href={socialLoginUrl('github')} className="portal-social-login-button" aria-label="Continue with GitHub">
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

            <div className="portal-login-divider">
              <span>or</span>
            </div>

            <div className="portal-guest-password-form">
              <label htmlFor="portal-guest-email">Email</label>
              <input
                id="portal-guest-email"
                type="email"
                autoComplete="email"
                required
                aria-required="true"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby={loginError ? 'portal-guest-login-error' : undefined}
              />

              <label htmlFor="portal-guest-password">Password</label>
              <input
                id="portal-guest-password"
                type="password"
                autoComplete="current-password"
                required
                aria-required="true"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={loginError ? 'portal-guest-login-error' : undefined}
              />

              {loginError ? (
                <p id="portal-guest-login-error" className="portal-login-error" role="alert" aria-live="polite">
                  {loginError}
                </p>
              ) : null}

              <button
                type="button"
                className="btn-primary portal-guest-submit"
                disabled={isSubmittingLogin || sessionLoading}
                aria-busy={isSubmittingLogin || sessionLoading}
                onClick={handlePasswordLogin}
              >
                {isSubmittingLogin || sessionLoading ? 'Signing in...' : 'Login'}
              </button>
            </div>

            <a
              href={pidpAppLoginUrl(nextUrl)}
              className="portal-identity-provider-link"
            >
              Open full identity provider
            </a>
          </div>
        </section>
      </main>
    )
  }

  return (
    <div className="portal-shell">
      <Header />
      <main className="portal-main">
        <div className="motion-feed">
          {loading ? (
            <div className="motion-feed-loading">Loading...</div>
          ) : ranked.length === 0 ? (
            <div className="motion-feed-empty">
              <p>No motions yet.</p>
              <Link to="/governance/propose" className="motion-feed-empty-link">
                Be the first to propose
              </Link>
            </div>
          ) : (
            <div className="motion-feed-list">
              {ranked.map((motion) => {
                const uv = userVotes[motion.id] ?? null
                const scoreClass = uv === 'up' ? 'up' : uv === 'down' ? 'down' : ''

                return (
                  <article
                    key={motion.id}
                    className="motion-feed-card"
                  >
                    <div className="motion-feed-main">
                      <div className="motion-feed-header">
                        <MotionStatusBadge status={motion.status} />
                        <h3 className="motion-feed-title">
                          <Link to={`/governance/${motion.id}`}>{motion.title}</Link>
                        </h3>
                      </div>
                      <p className="motion-feed-body">{motion.body}</p>
                    </div>

                    <div className="motion-feed-footer">
                      <div className="motion-vote-pill" aria-label={`Vote on ${motion.title}`}>
                        <button
                          type="button"
                          onClick={(e) => handleVote(motion.id, 'up', e)}
                          aria-label={`Upvote ${motion.title}. ${motion.voteCounts.up} upvotes`}
                          aria-pressed={uv === 'up'}
                          className={`motion-vote-btn ${uv === 'up' ? 'active-up' : ''}`}
                        >
                          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path d="M10 3l7 7h-4v7H7v-7H3l7-7z" />
                          </svg>
                        </button>

                        <span className={`motion-vote-score ${scoreClass}`} aria-label={`Score ${motion.score}`}>
                          {motion.score}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => handleVote(motion.id, 'down', e)}
                          aria-label={`Downvote ${motion.title}. ${motion.voteCounts.down} downvotes`}
                          aria-pressed={uv === 'down'}
                          className={`motion-vote-btn ${uv === 'down' ? 'active-down' : ''}`}
                        >
                          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path d="M10 17l-7-7h4V3h6v7h4l-7 7z" />
                          </svg>
                        </button>
                      </div>

                      <span className="motion-vote-breakdown" aria-label={`${motion.voteCounts.up} upvotes and ${motion.voteCounts.down} downvotes`}>
                        <span className="up">{motion.voteCounts.up}</span>
                        <span> / </span>
                        <span className="down">{motion.voteCounts.down}</span>
                      </span>

                      <div className="motion-feed-meta">
                        {motion.commentCount > 0 && (
                          <span>
                            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.5 }} aria-hidden="true">
                              <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H8l-4 3v-3H4a2 2 0 01-2-2V5z" />
                            </svg>{' '}
                            {motion.commentCount}
                          </span>
                        )}
                        <span>{motionProposerLabel(motion)}</span>
                        <span>&middot;</span>
                        <span>{timeAgo(motion.createdAtISO)}</span>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
