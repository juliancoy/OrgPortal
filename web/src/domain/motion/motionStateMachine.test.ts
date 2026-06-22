import { describe, expect, it } from 'vitest'
import type { Motion, MotionStatus } from './Motion'
import {
  canOpenVoting,
  canSecond,
  canVote,
  canWithdraw,
  getValidTransitions,
  isTerminalStatus,
  isValidTransition,
} from './motionStateMachine'

function motion(overrides: Partial<Motion> = {}): Motion {
  return {
    id: 'motion_1',
    type: 'main',
    title: 'Test motion',
    body: 'Test body',
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

describe('motionStateMachine', () => {
  it('prevents proposers from seconding their own proposed motion', () => {
    const proposed = motion()

    expect(canSecond(proposed, 'user_a')).toBe(false)
    expect(canSecond(proposed, 'user_b')).toBe(true)
    expect(canSecond({ ...proposed, status: 'discussion' }, 'user_b')).toBe(false)
  })

  it('allows each user to vote only once while a motion is in voting', () => {
    const voting = motion({
      status: 'voting',
      votes: [
        {
          id: 'vote_1',
          motionId: 'motion_1',
          voterId: 'user_a',
          voterName: 'Alice',
          choice: 'yea',
          castAtISO: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    expect(canVote(voting, 'user_a')).toBe(false)
    expect(canVote(voting, 'user_b')).toBe(true)
    expect(canVote({ ...voting, status: 'discussion' }, 'user_b')).toBe(false)
  })

  it('blocks opening voting while non-terminal amendments are pending', () => {
    const main = motion({ status: 'discussion' })
    const pendingAmendment = motion({
      id: 'amendment_1',
      type: 'amendment',
      parentMotionId: main.id,
      status: 'proposed',
    })
    const failedAmendment = { ...pendingAmendment, status: 'failed' as const }

    expect(canOpenVoting(main, [])).toBe(true)
    expect(canOpenVoting(main, [pendingAmendment])).toBe(false)
    expect(canOpenVoting(main, [failedAmendment])).toBe(true)
  })

  it('exposes the expected lifecycle transition matrix', () => {
    const expected: Record<MotionStatus, MotionStatus[]> = {
      proposed: ['seconded', 'withdrawn'],
      seconded: ['discussion'],
      discussion: ['voting', 'tabled'],
      voting: ['passed', 'failed'],
      tabled: ['discussion'],
      passed: [],
      failed: [],
      withdrawn: [],
    }

    for (const [from, transitions] of Object.entries(expected) as Array<[MotionStatus, MotionStatus[]]>) {
      expect(getValidTransitions(motion({ status: from }))).toEqual(transitions)
      for (const to of transitions) {
        expect(isValidTransition(from, to)).toBe(true)
      }
    }
    expect(isTerminalStatus('passed')).toBe(true)
    expect(isTerminalStatus('discussion')).toBe(false)
    expect(canWithdraw(motion(), 'user_a')).toBe(true)
  })
})
