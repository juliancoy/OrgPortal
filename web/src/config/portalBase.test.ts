import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizePostLoginPath, portalAuthCallbackUrl } from './pidp'
import { normalizePortalBasePath, portalPath, portalUrl, toInternalPortalPath } from './portalBase'

describe('portal base URL helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('normalizes Vite base paths without trailing slashes', () => {
    expect(normalizePortalBasePath('/')).toBe('')
    expect(normalizePortalBasePath('/p/')).toBe('/p')
    expect(normalizePortalBasePath('p/')).toBe('/p')
    expect(normalizePortalBasePath('https://codecollective.us/p/')).toBe('/p')
  })

  it('builds external URLs and deployment-relative paths from one base source', () => {
    vi.stubEnv('BASE_URL', '/p/')

    expect(portalPath('/chat')).toBe('/p/chat')
    expect(portalUrl('/auth/callback')).toBe('https://codecollective.us/p/auth/callback')
  })

  it('strips the deployed base from callback next paths before router navigation', () => {
    vi.stubEnv('BASE_URL', '/p/')

    expect(toInternalPortalPath('/p/chat')).toBe('/chat')
    expect(toInternalPortalPath('https://codecollective.us/p/chat?room=1')).toBe('/chat?room=1')
    expect(normalizePostLoginPath('/p/chat')).toBe('/chat')
  })

  it('generates auth callback URLs under the deployed base with internal next paths', () => {
    vi.stubEnv('BASE_URL', '/p/')

    const callback = new URL(portalAuthCallbackUrl('/p/chat'))
    expect(callback.toString()).toBe('https://codecollective.us/p/auth/callback?next=%2Fchat')
  })
})
