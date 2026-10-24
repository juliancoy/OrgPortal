import {afterEach,expect,it,vi} from 'vitest'
import {loadHostedOrganizationEvents} from './hostedEvents'
afterEach(()=>vi.unstubAllGlobals())
it('loads every hosted event across pages and preserves the request filter',async()=>{
 const first=Array.from({length:200},(_,id)=>({id:String(id)})),last=[{id:'200'},{id:'201'}]
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json(first)).mockResolvedValueOnce(Response.json(last));vi.stubGlobal('fetch',fetcher)
 const controller=new AbortController(),events=await loadHostedOrganizationEvents('different-org',controller.signal)
 expect(events).toHaveLength(202)
 expect(fetcher.mock.calls.map(([url])=>new URL(url,'https://portal.example').searchParams.get('offset'))).toEqual(['0','200'])
 for(const [url,options] of fetcher.mock.calls){expect(url).toContain('/different-org/events?upcoming_only=true&');expect(options.signal).toBe(controller.signal)}
})
it('does not silently return partial data or loop on a broken page',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:503})))
 await expect(loadHostedOrganizationEvents('one')).rejects.toThrow('Unable to load')
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({events:[]})))
 await expect(loadHostedOrganizationEvents('one')).rejects.toThrow('Invalid')
 const page=Array.from({length:200},(_,id)=>({id:String(id)}))
 vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(Response.json(page))))
 await expect(loadHostedOrganizationEvents('one')).rejects.toThrow('did not advance')
})
