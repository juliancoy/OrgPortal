import { afterEach,expect,it,vi } from 'vitest'
import { organizationFollowState } from './organizationFollowApi'
afterEach(()=>vi.unstubAllGlobals())
it('uses the authenticated private endpoint for follow and unfollow',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({following:true}))).mockResolvedValueOnce(new Response(JSON.stringify({following:false})))
 vi.stubGlobal('fetch',fetcher)
 expect(await organizationFollowState('org/id','token','PUT')).toBe(true)
 expect(await organizationFollowState('org/id','token','DELETE')).toBe(false)
 expect(fetcher.mock.calls[0][0]).toBe('/api/org/api/network/orgs/org%2Fid/follow')
 expect(fetcher.mock.calls[0][1]).toMatchObject({method:'PUT',headers:{Authorization:'Bearer token'},cache:'no-store'})
 expect(fetcher.mock.calls[1][1].method).toBe('DELETE')
})
it('reports failed or malformed updates without claiming success',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('{}',{status:401})).mockResolvedValueOnce(new Response('{}')))
 await expect(organizationFollowState('org','token','PUT')).rejects.toThrow()
 await expect(organizationFollowState('org','token','GET')).rejects.toThrow()
})
