import {beforeEach,expect,it,vi} from 'vitest'
let load: typeof import('./events').loadPublicEventFeed
beforeEach(async()=>{vi.unstubAllGlobals();vi.resetModules();vi.stubGlobal('location',{origin:'https://portal.example'});load=(await import('./events')).loadPublicEventFeed})
it('coalesces simultaneous visits, reuses fresh data and isolates renderer mutations',async()=>{
 let finish!: (r:Response)=>void
 const fetcher=vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve}));vi.stubGlobal('fetch',fetcher)
 const one=load('/api/org/api/network/events/public?limit=500&upcoming_only=false')
 const two=load('/api/org/api/network/events/public?upcoming_only=false&limit=500')
 finish(Response.json([{id:'one',title:'Original'}]));const [a,b]=await Promise.all([one,two])
 expect(fetcher).toHaveBeenCalledTimes(1);expect(a).toEqual(b)
 a[0].id='Changed'
 expect((await load('/api/org/api/network/events/public?limit=500&upcoming_only=false'))[0].id).toBe('one')
 expect(fetcher.mock.calls[0]).toEqual([expect.any(String),expect.objectContaining({credentials:'omit'})])
})
it('cancels one observer without cancelling the other and refetches after expiry',async()=>{
 let finish!: (r:Response)=>void
 const fetcher=vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve}));vi.stubGlobal('fetch',fetcher)
 const signal=new AbortController(),path='/api/org/api/network/events/public'
 const a=load(path,signal.signal),b=load(path)
 signal.abort();await expect(a).rejects.toMatchObject({name:'AbortError'})
 finish(Response.json([{id:'one'}]));expect(await b).toEqual([{id:'one'}])
 vi.spyOn(Date,'now').mockReturnValue(Date.now()+61_000)
 const c=load(path);expect(fetcher).toHaveBeenCalledTimes(2);finish(Response.json([{id:'two'}]));expect(await c).toEqual([{id:'two'}]);vi.restoreAllMocks()
})
it('rejects private feeds, credentials and broken responses without caching a failure',async()=>{
 for(const path of ['/api/org/api/network/following/events','https://elsewhere.example/api/org/api/network/events/public','/api/org/api/network/events/public?token=secret'])await expect(load(path)).rejects.toThrow('Only public')
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({events:[]})).mockResolvedValueOnce(new Response('',{status:503})).mockResolvedValueOnce(Response.json([{id:'okay'}]));vi.stubGlobal('fetch',fetcher)
 await expect(load('/api/org/api/network/events/public')).rejects.toThrow('unavailable')
 await expect(load('/api/org/api/network/events/public')).rejects.toThrow('503')
 expect(await load('/api/org/api/network/events/public')).toEqual([{id:'okay'}])
})
