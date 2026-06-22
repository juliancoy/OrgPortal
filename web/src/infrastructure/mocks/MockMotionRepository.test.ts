import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Motion } from '../../domain/motion/Motion'
import { MockMotionRepository } from './MockMotionRepository'

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
    clear: () => {
      storage.clear()
    },
  })
}

function motion(overrides: Partial<Motion> = {}): Motion {
  return {
    id: 'motion_1',
    type: 'main',
    title: 'Budget review',
    body: 'Approve the budget.',
    status: 'proposed',
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

function storeMotions(motions: Motion[]) {
  localStorage.setItem('demo.motions', JSON.stringify(motions))
}

describe('MockMotionRepository', () => {
  beforeEach(installLocalStorage)

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('filters motions by search, status, type, and parent motion', async () => {
    const main = motion({ id: 'main', status: 'discussion', createdAtISO: '2026-01-02T00:00:00.000Z' })
    const amendment = motion({
      id: 'amendment',
      type: 'amendment',
      parentMotionId: main.id,
      title: 'Budget amendment',
      createdAtISO: '2026-01-03T00:00:00.000Z',
    })
    const unrelated = motion({
      id: 'other',
      title: 'Membership update',
      body: 'Update member onboarding materials.',
      createdAtISO: '2026-01-01T00:00:00.000Z',
    })
    storeMotions([main, amendment, unrelated])

    const repo = new MockMotionRepository()

    await expect(repo.list({ search: 'budget', status: ['proposed', 'discussion'] })).resolves.toEqual([
      amendment,
      main,
    ])
    await expect(repo.list({ type: 'amendment', parentMotionId: main.id })).resolves.toEqual([amendment])
  })

  it('enforces second, withdraw, table, open voting, and resolve guards', async () => {
    const main = motion({ id: 'main', status: 'discussion' })
    const pendingAmendment = motion({
      id: 'amendment',
      type: 'amendment',
      parentMotionId: main.id,
      status: 'proposed',
    })
    storeMotions([motion({ id: 'proposed' }), main, pendingAmendment])
    const repo = new MockMotionRepository()

    await expect(repo.second('proposed', 'user_a', 'Alice')).rejects.toThrow('Cannot second this motion')
    await expect(repo.second('main', 'user_b', 'Bob')).rejects.toThrow('Cannot second this motion')
    await expect(repo.withdraw('main', 'user_a')).rejects.toThrow('Cannot withdraw this motion')
    await expect(repo.table('proposed')).rejects.toThrow('Cannot table this motion')
    await expect(repo.openVoting('main')).rejects.toThrow('Cannot open voting for this motion')
    await expect(repo.resolveVoting('main')).rejects.toThrow('Motion must be in voting status to resolve')
  })

  it('opens and resolves voting when lifecycle conditions are satisfied', async () => {
    storeMotions([
      motion({
        id: 'main',
        status: 'discussion',
        votes: [
          {
            id: 'vote_1',
            motionId: 'main',
            voterId: 'user_a',
            voterName: 'Alice',
            choice: 'yea',
            castAtISO: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'vote_2',
            motionId: 'main',
            voterId: 'user_b',
            voterName: 'Bob',
            choice: 'yea',
            castAtISO: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    ])
    const repo = new MockMotionRepository()

    const voting = await repo.openVoting('main')
    expect(voting.status).toBe('voting')

    const resolved = await repo.resolveVoting('main')
    expect(resolved.status).toBe('passed')
    expect(resolved.result).toEqual({ yea: 2, nay: 0, abstain: 0, totalEligible: 2, quorumMet: true, passed: true })
  })
})
