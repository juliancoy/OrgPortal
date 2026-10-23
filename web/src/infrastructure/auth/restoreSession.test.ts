import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {restoreSessionToken,SessionEnded,beginBrowserSignIn,logoutBrowserSession} from './restoreSession'
beforeEach(()=>beginBrowserSignIn())
afterEach(()=>{beginBrowserSignIn();vi.unstubAllGlobals()})
describe('remembered session restoration',()=>{
 it('restores through an uncached credentialed cookie request',async()=>{
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({access_token:' fresh-access-token '})))
  vi.stubGlobal('fetch',fetch)
  expect(await restoreSessionToken()).toBe('fresh-access-token')
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/session-token'),expect.objectContaining({credentials:'include',cache:'no-store'}))
 })
 it.each([401,403])('ends a session only on authoritative rejection %s',async status=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status})))
  await expect(restoreSessionToken()).rejects.toBeInstanceOf(SessionEnded)
 })
 it.each([429,500,503])('does not treat temporary HTTP %s as logout',async status=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status})))
  try{await restoreSessionToken();throw new Error('Expected failure')}catch(error){expect(error).not.toBeInstanceOf(SessionEnded)}
 })
 it('does not treat an offline network as logout',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  await expect(restoreSessionToken()).rejects.toBeInstanceOf(TypeError)
 })
})

it('offline logout is retried before any session restoration',async()=>{
 const fetch=vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(new Response(null,{status:204}))
 vi.stubGlobal('fetch',fetch)
 expect(await logoutBrowserSession()).toBe(false)
 await expect(restoreSessionToken()).rejects.toBeInstanceOf(SessionEnded)
 expect(fetch.mock.calls.map(call=>call[0])).toEqual([expect.stringContaining('/auth/session/logout'),expect.stringContaining('/auth/session/logout')])
})
