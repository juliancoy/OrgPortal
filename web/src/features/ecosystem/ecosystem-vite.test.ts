import { beforeEach, expect, it, vi } from 'vitest'
import type { ResolvedConfig, ViteDevServer } from 'vite'
import { ecosystemApi } from '../../../server/ecosystem-vite'

const mocks = vi.hoisted(() => ({ exec: vi.fn(), read: vi.fn(), kill: vi.fn() }))
vi.mock('node:child_process', () => ({ execFile: mocks.exec }))
vi.mock('node:fs/promises', () => ({ readFile: mocks.read }))

beforeEach(() => {
 vi.resetAllMocks()
 mocks.exec.mockReturnValue({ kill: mocks.kill })
 mocks.read.mockResolvedValue('{"version":"published"}')
})

function start() {
 const use = vi.fn(), once = vi.fn(), error = vi.fn()
 const server = { middlewares: { use }, httpServer: { once }, config: { logger: { error } } } as unknown as ViteDevServer
 const plugin = ecosystemApi()
 if (typeof plugin.configResolved !== 'function' || typeof plugin.configureServer !== 'function') throw Error('Missing startup hooks')
 plugin.configResolved.call({} as never, { root: '/web' } as ResolvedConfig)
 const result = plugin.configureServer.call({} as never, server)
 const response = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() }
 const handle = use.mock.calls[0][1]
 return { result, response, handle, once, error }
}

it('opens the portal while a data build is pending and serves the published dataset', async () => {
 const s = start()
 expect(s.result).toBeUndefined()
 s.handle({ url: '/overview', method: 'GET' }, s.response, vi.fn())
 await vi.waitFor(() => expect(s.response.end).toHaveBeenCalledWith('{"version":"published"}'))
 expect(s.response.statusCode).toBe(200)
 s.once.mock.calls[0][1]()
 expect(mocks.kill).toHaveBeenCalledOnce()
 mocks.exec.mock.calls[0][3](new Error('terminated during reload'))
 expect(s.error).not.toHaveBeenCalled()
})

it('returns a retryable data response when artifacts have not been built yet', async () => {
 mocks.read.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
 const s = start()
 s.handle({ url: '/overview', method: 'GET' }, s.response, vi.fn())
 await vi.waitFor(() => expect(s.response.end).toHaveBeenCalled())
 expect(s.response.statusCode).toBe(503)
 expect(s.response.setHeader).toHaveBeenCalledWith('Retry-After', '3')
})

it('keeps the portal available after a failed refresh and reports the data failure', async () => {
 const s = start()
 mocks.exec.mock.calls[0][3](new Error('build failed'))
 expect(s.error).toHaveBeenCalledWith(expect.stringContaining('build failed'))
 mocks.read.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
 s.handle({ url: '/overview', method: 'GET' }, s.response, vi.fn())
 await vi.waitFor(() => expect(s.response.end).toHaveBeenCalledWith(expect.stringContaining('unavailable')))
 expect(s.response.statusCode).toBe(503)
})
