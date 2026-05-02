import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { listMotions } from '../../../application/usecases/listMotions'
import type { Motion, MotionStatus, VoteDirection } from '../../../domain/motion/Motion'
import type { VoteCounts } from '../../../application/ports/EngagementRepository'
import type { MotionListQuery } from '../../../application/ports/MotionRepository'
import { MotionStatusBadge } from '../../components/governance/MotionStatusBadge'
import { GovernanceNav, GovernanceBreadcrumb } from '../../components/governance/GovernanceNav'
import { useGovernanceParadigm, useGovernanceRepositories } from './paradigm'

const STATUS_FILTERS: (MotionStatus | null)[] = [
  null,
  'proposed',
  'discussion',
  'voting',
  'passed',
  'failed',
  'tabled',
]

const STATUS_LABELS: Record<string, string> = {
  all: 'All',
  proposed: 'Proposed',
  discussion: 'Discussion',
  voting: 'Voting',
  passed: 'Passed',
  failed: 'Failed',
  tabled: 'Tabled',
}

type SortMode = 'newest' | 'score'

function getGuestId(): string {
  const key = 'governance.guestId'
  let id = localStorage.getItem(key)
  if (!id) {
    id = `guest_${Math.random().toString(36).slice(2)}`
    localStorage.setItem(key, id)
  }
  return id
}

function motionProposerLabel(motion: Motion) {
  if (motion.proposerType === 'org') {
    return `Organization ${motion.proposerName}`
  }
  return motion.proposerName
}

export function MotionListPage() {
  const { motionRepository, engagementRepository } = useGovernanceRepositories()
  const { basePath, isRoberts } = useGovernanceParadigm()
  const { user } = useAuth()
  const navigate = useNavigate()
  const effectiveUserId = user?.id ?? getGuestId()
  const [motions, setMotions] = useState<Motion[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<MotionStatus | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [userVotes, setUserVotes] = useState<Record<string, VoteDirection | null>>({})
  const [voteCounts, setVoteCounts] = useState<Record<string, VoteCounts>>({})

  useEffect(() => {
    document.title = isRoberts ? "Org Portal • Governance • Robert's Rules" : 'Org Portal • Governance'
  }, [isRoberts])

  useEffect(() => {
    const query: MotionListQuery = {}
    if (search) query.search = search
    if (statusFilter) query.status = [statusFilter]
    listMotions(motionRepository, query).then((fetched) => {
      setMotions(fetched)
      Promise.all(
        fetched.map((m) =>
          Promise.all([
            engagementRepository.getUserVote(m.id, effectiveUserId),
            engagementRepository.getVoteCounts(m.id),
          ]).then(([dir, vc]) => [m.id, dir, vc] as const),
        ),
      ).then((triples) => {
        const voteMap: Record<string, VoteDirection | null> = {}
        const countMap: Record<string, VoteCounts> = {}
        for (const [id, dir, vc] of triples) {
          voteMap[id] = dir
          countMap[id] = vc
        }
        setUserVotes(voteMap)
        setVoteCounts(countMap)
      })
    })
  }, [motionRepository, engagementRepository, search, statusFilter, effectiveUserId])

  const sortedMotions = [...motions].sort((a, b) => {
    if (sortMode === 'score') return b.score - a.score || b.createdAtISO.localeCompare(a.createdAtISO)
    return b.createdAtISO.localeCompare(a.createdAtISO)
  })

  async function handleVote(motionId: string, direction: 'up' | 'down', e: React.MouseEvent) {
    e.stopPropagation()
    const result =
      direction === 'up'
        ? await engagementRepository.upvote(motionId, effectiveUserId)
        : await engagementRepository.downvote(motionId, effectiveUserId)
    setMotions((prev) => prev.map((m) => (m.id === motionId ? { ...m, score: result.score } : m)))
    setUserVotes((prev) => ({ ...prev, [motionId]: result.userVote }))
  }

  return (
    <div>
      <GovernanceNav />
      <div className="motion-list-wrap">
        <GovernanceBreadcrumb items={[]} />

        <div className="motion-list-header">
          <h1 className="motion-list-title">Motions</h1>
        </div>

        <div className="motion-list-toolbar">
          <input
            type="text"
            placeholder="Search motions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="motion-list-search"
          />

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="motion-list-sort-label">Sort</span>
            {(['score', 'newest'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                className={`motion-list-sort ${sortMode === mode ? 'active' : ''}`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="motion-list-filters">
          {STATUS_FILTERS.map((s) => {
            const label = s ? STATUS_LABELS[s] : STATUS_LABELS.all
            const active = statusFilter === s
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`motion-list-filter ${active ? 'active' : ''}`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {sortedMotions.length === 0 ? (
          <div className="motion-list-empty">No motions found.</div>
        ) : (
          <div className="motion-list-grid">
            {sortedMotions.map((motion) => {
              const uv = userVotes[motion.id] ?? null
              const vc = voteCounts[motion.id] ?? { up: 0, down: 0, score: 0 }
              const voteColor = uv === 'up' ? 'var(--vote-up)' : uv === 'down' ? 'var(--vote-down)' : 'var(--text-primary)'

              return (
                <article
                  key={motion.id}
                  onClick={() => navigate(`${basePath}/${motion.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') navigate(`${basePath}/${motion.id}`)
                  }}
                  className="motion-list-card"
                >
                  <div className="motion-list-vote">
                    <button
                      type="button"
                      onClick={(e) => handleVote(motion.id, 'up', e)}
                      aria-label="Upvote"
                      className={`motion-vote-btn ${uv === 'up' ? 'active-up' : ''}`}
                    >
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 3l7 7h-4v7H7v-7H3l7-7z" />
                      </svg>
                    </button>

                    <span className="motion-list-vote-count" style={{ color: voteColor }}>
                      {motion.score}
                    </span>

                    <span className="motion-list-vote-breakdown">
                      {vc.up}↑ {vc.down}↓
                    </span>

                    <button
                      type="button"
                      onClick={(e) => handleVote(motion.id, 'down', e)}
                      aria-label="Downvote"
                      className={`motion-vote-btn ${uv === 'down' ? 'active-down' : ''}`}
                    >
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 17l-7-7h4V3h6v7h4l-7 7z" />
                      </svg>
                    </button>
                  </div>

                  <div className="motion-list-content">
                    <div className="motion-list-content-top">
                      <MotionStatusBadge status={motion.status} />
                      <span className="motion-list-card-title">{motion.title}</span>
                    </div>
                    <div className="motion-list-meta">
                      Proposed by {motionProposerLabel(motion)} on {motion.createdAtISO.slice(0, 10)}
                    </div>
                    <p className="motion-list-body">{motion.body.length > 120 ? `${motion.body.slice(0, 120)}...` : motion.body}</p>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
