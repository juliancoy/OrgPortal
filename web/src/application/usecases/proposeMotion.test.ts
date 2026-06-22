import { describe, expect, it, vi } from 'vitest'
import type { MotionRepository } from '../ports/MotionRepository'
import { proposeMotion, validateProposeMotion, type ProposeMotionRequest } from './proposeMotion'

const validRequest: ProposeMotionRequest = {
  title: 'Adopt budget',
  body: 'Approve the annual budget.',
  proposerId: 'user_1',
  proposerName: 'Julian',
  quorumRequired: 3,
}

describe('proposeMotion', () => {
  it('validates required text, organization selection, and quorum', () => {
    expect(
      validateProposeMotion({
        ...validRequest,
        title: ' ',
        body: '',
        proposerType: 'org',
        proposerOrgId: '',
        quorumRequired: 0,
      }),
    ).toEqual([
      'Title is required',
      'Body is required',
      'Organization selection is required',
      'Quorum must be at least 1',
    ])
  })

  it('creates a normalized user motion after validation passes', async () => {
    const repo = {
      create: vi.fn(async (input) => ({
        id: 'motion_1',
        status: 'proposed',
        createdAtISO: '2026-01-01T00:00:00.000Z',
        updatedAtISO: '2026-01-01T00:00:00.000Z',
        votes: [],
        score: 0,
        ...input,
      })),
    } as unknown as MotionRepository

    const result = await proposeMotion(repo, validRequest)

    expect(result.ok).toBe(true)
    expect(repo.create).toHaveBeenCalledWith({
      type: 'main',
      title: validRequest.title,
      body: validRequest.body,
      proposerType: 'user',
      proposerId: validRequest.proposerId,
      proposerName: validRequest.proposerName,
      proposerUserName: undefined,
      proposerOrgId: undefined,
      proposerOrgName: undefined,
      quorumRequired: validRequest.quorumRequired,
    })
  })

  it('passes organization proposer metadata through to the repository', async () => {
    const repo = { create: vi.fn(async (input) => input) } as unknown as MotionRepository

    await proposeMotion(repo, {
      ...validRequest,
      proposerType: 'org',
      proposerName: 'Code Collective',
      proposerUserName: 'Julian',
      proposerOrgId: 'org_1',
      proposerOrgName: 'Code Collective',
    })

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        proposerType: 'org',
        proposerName: 'Code Collective',
        proposerUserName: 'Julian',
        proposerOrgId: 'org_1',
        proposerOrgName: 'Code Collective',
      }),
    )
  })
})
