import type { InitiativeRepository } from '../application/ports/InitiativeRepository'
import type { SignatureRepository } from '../application/ports/SignatureRepository'
import type { MotionRepository } from '../application/ports/MotionRepository'
import type { VoteRepository } from '../application/ports/VoteRepository'
import type { EngagementRepository } from '../application/ports/EngagementRepository'
import type { ChatService } from '../application/ports/ChatService'

import { MockInitiativeRepository } from '../infrastructure/mocks/MockInitiativeRepository'
import { MockSignatureRepository } from '../infrastructure/mocks/MockSignatureRepository'
import { MockMotionRepository } from '../infrastructure/mocks/MockMotionRepository'
import { MockVoteRepository } from '../infrastructure/mocks/MockVoteRepository'
import { MockEngagementRepository } from '../infrastructure/mocks/MockEngagementRepository'
import { MockChatService } from '../infrastructure/mocks/MockChatService'
import { APIEngagementRepository } from '../infrastructure/api/APIEngagementRepository'
import { APIMotionRepository } from '../infrastructure/api/APIMotionRepository'
import { APIVoteRepository } from '../infrastructure/api/APIVoteRepository'
import { MatrixChatService } from '../chat/matrixService'
import { isNativeCapacitorRuntime } from '../infrastructure/platform/runtimePlatform'

/**
 * Application services container
 */
export type AppServices = {
  initiativeRepository: InitiativeRepository
  signatureRepository: SignatureRepository
  motionRepository: MotionRepository
  voteRepository: VoteRepository
  engagementRepository: EngagementRepository
  chatService: ChatService
}

/**
 * Configuration options for creating services
 */
export type ServicesConfig = {
  /** Data source type: 'mock' for localStorage, 'api' for backend */
  dataSource: 'mock' | 'api'
  /** API base URL (required when dataSource is 'api') */
  apiBaseUrl?: string
  /** Chat backend implementation */
  chatBackend: 'matrix' | 'mock'
}

/**
 * Get configuration from environment variables
 */
function getConfig(): ServicesConfig {
  const env = (import.meta as any).env
  const dataSourceEnv = env?.VITE_DATA_SOURCE as string | undefined
  const dataSource =
    dataSourceEnv === 'api'
      ? 'api'
      : dataSourceEnv === 'mock'
      ? 'mock'
      : env?.PROD
      ? 'api'
      : 'mock'
  
  const chatBackendEnv = env?.VITE_CHAT_BACKEND as string | undefined
  const chatBackend = chatBackendEnv === 'mock' ? 'mock' : 'matrix'

  let apiBaseUrl = env?.VITE_API_BASE_URL || '/api/org/api/governance'
  if (isNativeCapacitorRuntime() && typeof apiBaseUrl === 'string' && apiBaseUrl.startsWith('/')) {
    const nativePortalBase = (env?.VITE_NATIVE_PORTAL_BASE_URL as string | undefined)?.trim() || 'https://dev.portal.arkavo.org'
    apiBaseUrl = `${nativePortalBase.replace(/\/$/, '')}${apiBaseUrl}`
  }

  return {
    dataSource,
    apiBaseUrl,
    chatBackend,
  }
}

/**
 * Factory functions for creating repositories
 * 
 * Following the Factory Method pattern to allow swapping implementations
 * without touching use cases or UI components.
 */

function createInitiativeRepository(_config: ServicesConfig): InitiativeRepository {
  // Currently only mock implementation available
  // TODO: Create APIInitiativeRepository when backend endpoints are ready
  return new MockInitiativeRepository()
}

function createSignatureRepository(_config: ServicesConfig): SignatureRepository {
  // Currently only mock implementation available
  return new MockSignatureRepository()
}

function createMotionRepository(config: ServicesConfig): MotionRepository {
  if (config.dataSource === 'api') {
    if (!config.apiBaseUrl) {
      throw new Error('API base URL is required when using api data source')
    }
    return new APIMotionRepository(config.apiBaseUrl)
  }
  return new MockMotionRepository()
}

function createVoteRepository(config: ServicesConfig): VoteRepository {
  if (config.dataSource === 'api') {
    if (!config.apiBaseUrl) {
      throw new Error('API base URL is required when using api data source')
    }
    return new APIVoteRepository(config.apiBaseUrl)
  }
  return new MockVoteRepository()
}

function createEngagementRepository(config: ServicesConfig): EngagementRepository {
  if (config.dataSource === 'api') {
    if (!config.apiBaseUrl) {
      throw new Error('API base URL is required when using api data source')
    }
    return new APIEngagementRepository(config.apiBaseUrl)
  }
  
  return new MockEngagementRepository()
}

function createChatService(config: ServicesConfig): ChatService {
  if (config.chatBackend === 'mock') {
    return new MockChatService()
  }
  return new MatrixChatService()
}

/**
 * Create application services container
 * 
 * Usage:
 *   const services = createServices() // Uses env configuration
 *   
 *   // Or with explicit config:
 *   const services = createServices({ dataSource: 'api', apiBaseUrl: '/api' })
 */
export function createServices(config?: Partial<ServicesConfig>): AppServices {
  const finalConfig = { ...getConfig(), ...config }
  
  return {
    initiativeRepository: createInitiativeRepository(finalConfig),
    signatureRepository: createSignatureRepository(finalConfig),
    motionRepository: createMotionRepository(finalConfig),
    voteRepository: createVoteRepository(finalConfig),
    engagementRepository: createEngagementRepository(finalConfig),
    chatService: createChatService(finalConfig),
  }
}

/**
 * Create services for testing
 * 
 * All repositories use mock implementations with isolated storage.
 */
export function createTestServices(): AppServices {
  return {
    initiativeRepository: new MockInitiativeRepository(),
    signatureRepository: new MockSignatureRepository(),
    motionRepository: new MockMotionRepository(),
    voteRepository: new MockVoteRepository(),
    engagementRepository: new MockEngagementRepository(),
    chatService: new MockChatService(),
  }
}
