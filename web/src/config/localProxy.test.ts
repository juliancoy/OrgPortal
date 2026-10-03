import { afterEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

async function loadViteServerConfig(env: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...env }
  vi.resetModules()
  const configModule = await import('../../vite.config.ts')
  const configExport = configModule.default as unknown
  const config = typeof configExport === 'function'
    ? await configExport({ command: 'serve', mode: 'test', isSsrBuild: false, isPreview: false })
    : configExport
  return (config as { server: { proxy: Record<string, { target?: string }>; hmr?: unknown } }).server
}

describe('local Vite server routing', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.resetModules()
  })

  it('routes native chat requests to CHAT_API_ORIGIN independently from ORG_API_ORIGIN', async () => {
    const { proxy } = await loadViteServerConfig({
      CHAT_API_ORIGIN: 'https://chat.example.test',
      ORG_API_ORIGIN: 'https://org.example.test',
    })

    expect(proxy['/api/chat']?.target).toBe('https://chat.example.test')
    expect(proxy['/api/org']?.target).toBe('https://org.example.test')
    expect(proxy['/api/chat']?.target).not.toBe(proxy['/api/org']?.target)
  })
  it('lets hot reload follow the browser origin through the local HTTPS gateway', async () => {
    const { hmr } = await loadViteServerConfig({})
    expect(hmr).toBeUndefined()
  })

})
