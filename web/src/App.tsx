import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, useServices } from './app/AppProviders'
import { Header } from './ui/shell/Header'
import { Footer } from './ui/shell/Footer'
import { pidpAppLoginUrl } from './config/pidp'
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
  const { user, role } = useAuth()
  const { motionRepository, engagementRepository } = useServices()
  const navigate = useNavigate()
  const nextUrl = window.location.href
  const isGuest = role === 'guest'
  const effectiveUserId = user?.id ?? getGuestId()

  const [ranked, setRanked] = useState<RankedMotion[]>([])
  const [userVotes, setUserVotes] = useState<Record<string, VoteDirection | null>>({})
  const [loading, setLoading] = useState(true)

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

  if (isGuest) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem 1rem',
          background: 'var(--body-bg)',
        }}
      >
        <section
          className="panel"
          style={{
            width: '100%',
            maxWidth: 880,
            padding: '2.5rem',
            borderRadius: 20,
            boxShadow: 'var(--shadow-lg)',
            display: 'grid',
            gap: '1.25rem',
          }}
        >
          <img
            src="/images/namebanner.png"
            alt="Code Collective"
            style={{ width: 'min(100%, 420px)', height: 'auto' }}
          />
          <p className="muted" style={{ margin: 0, maxWidth: 680, fontSize: '1.05rem', lineHeight: 1.6 }}>
            Coding a New Economy
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <a
              href={pidpAppLoginUrl(nextUrl)}
              className="btn-primary"
              style={{
                padding: '1.1rem 2.2rem',
                fontSize: '1.2rem',
                fontWeight: 700,
                letterSpacing: '0.01em',
                boxShadow: '0 0 0 4px rgba(122, 188, 255, 0.35), 0 14px 28px rgba(11, 30, 61, 0.4)',
              }}
            >
              Login
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
                    onClick={() => navigate(`/governance/${motion.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') navigate(`/governance/${motion.id}`)
                    }}
                  >
                    <div className="motion-feed-main">
                      <div className="motion-feed-header">
                        <MotionStatusBadge status={motion.status} />
                        <h3 className="motion-feed-title">{motion.title}</h3>
                      </div>
                      <p className="motion-feed-body">{motion.body}</p>
                    </div>

                    <div className="motion-feed-footer">
                      <div className="motion-vote-pill" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => handleVote(motion.id, 'up', e)}
                          aria-label="Upvote"
                          className={`motion-vote-btn ${uv === 'up' ? 'active-up' : ''}`}
                        >
                          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 3l7 7h-4v7H7v-7H3l7-7z" />
                          </svg>
                        </button>

                        <span className={`motion-vote-score ${scoreClass}`}>{motion.score}</span>

                        <button
                          type="button"
                          onClick={(e) => handleVote(motion.id, 'down', e)}
                          aria-label="Downvote"
                          className={`motion-vote-btn ${uv === 'down' ? 'active-down' : ''}`}
                        >
                          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 17l-7-7h4V3h6v7h4l-7 7z" />
                          </svg>
                        </button>
                      </div>

                      <span className="motion-vote-breakdown">
                        <span className="up">{motion.voteCounts.up}</span>
                        <span> / </span>
                        <span className="down">{motion.voteCounts.down}</span>
                      </span>

                      <div className="motion-feed-meta">
                        {motion.commentCount > 0 && (
                          <span>
                            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.5 }}>
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
