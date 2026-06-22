import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Motion } from '../../domain/motion/Motion'
import { MockVoteRepository } from './MockVoteRepository'

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
    status: 'voting',
    proposerId: 'user_a',
    proposerName: 'Alice',
    createdAtISO: '2026-01-01T00:00:00.000Z',
    updatedAtISO: '2026-01-01T00:00:00.000Z',
    quorumRequired: 2,
    votes: [],
    score: 0,
    ...overrides,
  }
}

describe('MockVoteRepository', () => {
  beforeEach(installLocalStorage)

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects votes outside voting status and duplicate voter ballots', async () => {
    localStorage.setItem(
      'demo.motions',
      JSON.stringify([
        motion({ id: 'discussion', status: 'discussion' }),
        motion({
          id: 'voting',
          votes: [
            {
              id: 'vote_1',
              motionId: 'voting',
              voterId: 'user_a',
              voterName: 'Alice',
              choice: 'yea',
              castAtISO: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      ]),
    )

    const repo = new MockVoteRepository()

    await expect(repo.castVote('discussion', 'user_b', 'Bob', 'yea')).rejects.toThrow('Cannot vote on this motion')
    await expect(repo.castVote('voting', 'user_a', 'Alice', 'nay')).rejects.toThrow('Cannot vote on this motion')
  })

  it('records a vote and auto-resolves when quorum is reached', async () => {
    localStorage.setItem(
      'demo.motions',
      JSON.stringify([
        motion({
          id: 'voting',
          votes: [
            {
              id: 'vote_1',
              motionId: 'voting',
              voterId: 'user_a',
              voterName: 'Alice',
              choice: 'yea',
              castAtISO: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      ]),
    )

    const repo = new MockVoteRepository()
    const vote = await repo.castVote('voting', 'user_b', 'Bob', 'yea')
    const stored = JSON.parse(localStorage.getItem('demo.motions') || '[]') as Motion[]

    expect(vote.choice).toBe('yea')
    expect(stored[0].status).toBe('passed')
    expect(stored[0].result).toEqual({ yea: 2, nay: 0, abstain: 0, totalEligible: 2, quorumMet: true, passed: true })
  })
})
