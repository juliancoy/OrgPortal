import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Motion } from '../../domain/motion/Motion'
import { MockEngagementRepository } from './MockEngagementRepository'

function installLocalStorage() {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
  })
}

function motion(overrides: Partial<Motion> = {}): Motion {
  return {
    id: 'motion_1',
    type: 'main',
    title: 'Budget review',
    body: 'Approve the budget.',
    status: 'discussion',
    proposerId: 'user_a',
    proposerName: 'Alice',
    createdAtISO: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    updatedAtISO: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    quorumRequired: 2,
    votes: [],
    score: 0,
    ...overrides,
  }
}

describe('MockEngagementRepository', () => {
  beforeEach(() => {
    installLocalStorage()
    localStorage.setItem('demo.engagement.votes', '{}')
    localStorage.setItem('demo.engagement.comments', '[]')
    localStorage.setItem('demo.engagement.profiles', '{}')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('toggles upvotes and replaces an existing downvote', async () => {
    const repo = new MockEngagementRepository()

    await expect(repo.upvote('motion_1', 'user_1')).resolves.toEqual({ score: 1, userVote: 'up' })
    await expect(repo.downvote('motion_1', 'user_1')).resolves.toEqual({ score: -1, userVote: 'down' })
    await expect(repo.downvote('motion_1', 'user_1')).resolves.toEqual({ score: 0, userVote: null })
    await expect(repo.getVoteCounts('motion_1')).resolves.toEqual({ up: 0, down: 0, score: 0 })
  })

  it('tracks comments, vote counts, and ranking metadata', async () => {
    const repo = new MockEngagementRepository()
    const popular = motion({ id: 'popular', score: 10 })
    const quiet = motion({ id: 'quiet', score: 0 })

    await repo.upvote('popular', 'user_1')
    await repo.upvote('popular', 'user_2')
    await repo.addComment({ motionId: 'popular', authorId: 'user_1', authorName: 'Alice', body: 'Worth doing.' })

    const ranked = await repo.rankMotions([quiet, popular], 'viewer')

    expect(ranked[0].id).toBe('popular')
    expect(ranked[0].commentCount).toBe(1)
    expect(ranked[0].voteCounts).toEqual({ up: 2, down: 0, score: 2 })
    expect(ranked[1].id).toBe('quiet')
  })
})
