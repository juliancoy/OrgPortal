import { afterEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

async function loadViteServerProxy(env: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...env }
  vi.resetModules()
  const configModule = await import('../../vite.config.ts')
  const configExport = configModule.default as unknown
  const config = typeof configExport === 'function'
    ? await configExport({ command: 'serve', mode: 'test', isSsrBuild: false, isPreview: false })
    : configExport
  return (config as { server?: { proxy?: Record<string, { target?: string }> } }).server?.proxy || {}
}

describe('local Vite API proxy routing', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.resetModules()
  })

  it('routes native chat requests to CHAT_API_ORIGIN independently from ORG_API_ORIGIN', async () => {
    const proxy = await loadViteServerProxy({
      CHAT_API_ORIGIN: 'https://chat.example.test',
      ORG_API_ORIGIN: 'https://org.example.test',
    })

    expect(proxy['/api/chat']?.target).toBe('https://chat.example.test')
    expect(proxy['/api/org']?.target).toBe('https://org.example.test')
    expect(proxy['/api/chat']?.target).not.toBe(proxy['/api/org']?.target)
  })
})
