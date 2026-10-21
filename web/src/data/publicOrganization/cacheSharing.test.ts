import { IDBFactory } from 'fake-indexeddb'
import { expect, it, vi } from 'vitest'

it('invalidates another page’s memory after a committed IndexedDB write without broadcasting response data',async()=>{
 const channels:Channel[]=[]
 const messages:unknown[]=[]
 class Channel {
  onmessage:((event:{data:unknown})=>void)|null=null
  constructor(_name:string){channels.push(this)}
  postMessage(data:unknown){messages.push(data);for(const other of channels)if(other!==this)other.onmessage?.({data})}
 }
 vi.stubGlobal('indexedDB',new IDBFactory())
 vi.stubGlobal('location',{origin:'https://lifetech.fyi'})
 vi.stubGlobal('window',new EventTarget())
 vi.stubGlobal('BroadcastChannel',Channel)
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({name:'Original'})).mockResolvedValueOnce(Response.json({name:'Updated'}))
 vi.stubGlobal('fetch',fetcher)
 const first=await import('./cache')
 const path='/api/org/api/network/orgs/public/rpm-tech'
 const validate=(data:unknown)=>data as {name:string}
 await first.refreshPublicReport(path,{validate})
 vi.resetModules()
 const second=await import('./cache')
 expect((await second.refreshPublicReport(path,{validate})).data.name).toBe('Original')
 await first.refreshPublicReport(path,{validate,force:true})
 expect((await second.refreshPublicReport(path,{validate})).data.name).toBe('Updated')
 expect(fetcher).toHaveBeenCalledTimes(2)
 expect(messages).toEqual([{url:'https://lifetech.fyi'+path},{url:'https://lifetech.fyi'+path}])
 channels[1].onmessage?.({data:{url:'https://other.example'+path}})
 expect((await second.readPublicReport<{name:string}>(path))?.data.name).toBe('Updated')
 await first.invalidatePublicOrganizationData()
 expect((await second.readPublicReport<{name:string}>(path))?.checkedAt).toBe(0)
 expect((await second.readPublicReport<{name:string}>(path))?.data.name).toBe('Updated')
 vi.unstubAllGlobals()
})
