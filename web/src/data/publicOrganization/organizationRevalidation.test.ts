import {IDBFactory} from 'fake-indexeddb'
import {expect,it,vi} from 'vitest'
import {loadPublicOrganizationDirectory} from './organizations'
import {refreshPublicReport} from './cache'
it('shows a validated saved directory while slow revalidation is still pending',async()=>{
 vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('location',{origin:'https://portal.example'})
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json([{id:'one',name:'Saved',slug:'one'}])))
 await refreshPublicReport('/api/org/api/network/orgs/public?limit=500&offset=0',{validate:value=>value})
 let finish!: (r:Response)=>void
 vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve})))
 const onPage=vi.fn(),loading=loadPublicOrganizationDirectory({force:true,onPage})
 await vi.waitFor(()=>expect(finish).toBeTypeOf('function'))
 expect(onPage).toHaveBeenCalledWith([{id:'one',name:'Saved',slug:'one'}])
 finish(Response.json([{id:'one',name:'Updated',slug:'one'}]));expect((await loading)[0].name).toBe('Updated')
 vi.unstubAllGlobals()
})
