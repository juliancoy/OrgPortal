import { describe, expect, it, vi } from 'vitest'
import { loadPeopleDirectory } from './peopleDirectory'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('loadPeopleDirectory', () => {
  it('loads only public people without requesting organizations', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/users/public')) {
        return jsonResponse(200, [{ user_id: 'user-1', user_name: 'Ada' }])
      }
      return jsonResponse(500, { detail: 'Internal server error' })
    })

    const result = await loadPeopleDirectory({
      token: null,
      query: '',
      signal: new AbortController().signal,
      fetcher,
    })

    expect(result.users).toEqual([{ user_id: 'user-1', user_name: 'Ada' }])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(String(fetcher.mock.calls[0][0])).toContain('/users/public')
    expect(result.status).toBe('')
    expect(result.status).not.toContain('Internal server error')
  })

  it('reports unavailable people without requesting organizations', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/orgs/public')) {
        return jsonResponse(200, [{ id: 'org-1', name: 'Code Collective', slug: 'code-collective' }])
      }
      return jsonResponse(503, { detail: 'Unavailable' })
    })

    const result = await loadPeopleDirectory({
      token: null,
      query: 'code',
      signal: new AbortController().signal,
      fetcher,
    })

    expect(result.users).toEqual([])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('People are temporarily unavailable.')
  })

  it('authenticates the people request and forwards the search filter', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      return url.includes('/orgs/public')
        ? jsonResponse(200, [{ id: 'org-1', name: 'Code Collective', slug: 'code-collective' }])
        : jsonResponse(200, [{ user_id: 'user-1', user_name: 'Ada' }])
    })

    const result = await loadPeopleDirectory({
      token: 'test-token',
      query: 'Ada',
      signal: new AbortController().signal,
      fetcher,
    })

    expect(result.status).toBe('')
    expect(result.users).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const userCall = fetcher.mock.calls.find(([input]) => String(input).includes('/api/network/users?'))
    expect(userCall?.[1]?.headers).toEqual({ Authorization: 'Bearer test-token' })
    expect(String(userCall?.[0])).toContain('q=Ada')
  })
})
