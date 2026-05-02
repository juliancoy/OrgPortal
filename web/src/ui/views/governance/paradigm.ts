import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useServices } from '../../../app/AppProviders'
import { APIEngagementRepository } from '../../../infrastructure/api/APIEngagementRepository'
import { APIMotionRepository } from '../../../infrastructure/api/APIMotionRepository'
import { APIVoteRepository } from '../../../infrastructure/api/APIVoteRepository'

const ROBERTS_API_BASE_DEFAULT = '/api/governance'
const ORG_API_BASE_DEFAULT = '/api/org/api/governance'
const ROBERTS_PATH_PREFIX = '/governance/roberts'

export function useGovernanceParadigm() {
  const location = useLocation()
  const isRoberts = location.pathname === ROBERTS_PATH_PREFIX || location.pathname.startsWith(`${ROBERTS_PATH_PREFIX}/`)
  const basePath = isRoberts ? ROBERTS_PATH_PREFIX : '/governance'
  return { isRoberts, basePath }
}

export function useGovernanceRepositories() {
  const services = useServices()
  const { isRoberts } = useGovernanceParadigm()

  return useMemo(() => {
    if (!isRoberts) {
      return {
        motionRepository: services.motionRepository,
        voteRepository: services.voteRepository,
        engagementRepository: services.engagementRepository,
      }
    }

    const env = (import.meta as { env?: Record<string, string | undefined> }).env
    const robertsApiBase = env?.VITE_ROBERTS_GOVERNANCE_API_BASE_URL || ROBERTS_API_BASE_DEFAULT
    const orgApiBase = env?.VITE_API_BASE_URL || ORG_API_BASE_DEFAULT
    const normalizedBase = robertsApiBase.replace(/\/$/, '')
    const fallbackBase = orgApiBase.replace(/\/$/, '')

    return {
      motionRepository: new APIMotionRepository(normalizedBase),
      voteRepository: new APIVoteRepository(normalizedBase),
      engagementRepository: new APIEngagementRepository(normalizedBase || fallbackBase),
    }
  }, [isRoberts, services])
}

