import type { MotionRepository } from '../ports/MotionRepository'

export type ProposeMotionRequest = {
  title: string
  body: string
  proposerType?: 'user' | 'org'
  proposerId: string
  proposerName: string
  proposerUserName?: string
  proposerOrgId?: string
  proposerOrgName?: string
  quorumRequired: number
}

export function validateProposeMotion(req: ProposeMotionRequest): string[] {
  const errors: string[] = []
  if (!req.title?.trim()) errors.push('Title is required')
  if (!req.body?.trim()) errors.push('Body is required')
  if (req.proposerType === 'org' && !req.proposerOrgId?.trim()) errors.push('Organization selection is required')
  if (req.quorumRequired < 1) errors.push('Quorum must be at least 1')
  return errors
}

export async function proposeMotion(repo: MotionRepository, req: ProposeMotionRequest) {
  const errors = validateProposeMotion(req)
  if (errors.length) return { ok: false as const, errors }
  const motion = await repo.create({
    type: 'main',
    title: req.title,
    body: req.body,
    proposerType: req.proposerType || 'user',
    proposerId: req.proposerId,
    proposerName: req.proposerName,
    proposerUserName: req.proposerUserName,
    proposerOrgId: req.proposerOrgId,
    proposerOrgName: req.proposerOrgName,
    quorumRequired: req.quorumRequired,
  })
  return { ok: true as const, motion }
}
