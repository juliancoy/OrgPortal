import {afterEach,expect,it,vi} from 'vitest'
import {loadOrganizationMapLayout} from './organizationMapLayoutClient'
import {organizationMapLayout,type MapPage,type PositionedNode} from './organizationMap'

class LayoutWorker {
 static instances:LayoutWorker[]=[]
 onmessage:((event:{data:PositionedNode[]})=>void)|null=null
 onerror:(()=>void)|null=null
 onmessageerror:(()=>void)|null=null
 terminate=vi.fn()
 postMessage=vi.fn()
 constructor(){LayoutWorker.instances.push(this)}
}
const page=(count=130):MapPage=>({version:'v1',generatedAt:'2026-11-21',anchor:'0',organizations:Array.from({length:count},(_,i)=>({id:String(i),name:String(i),slug:null,category:'general'})),relationships:[],total:count-1,incoming:0,outgoing:0,offset:0,nextOffset:null})
afterEach(()=>{vi.unstubAllGlobals();LayoutWorker.instances=[]})
it('offloads large layouts, terminates the worker and caches independent positions per mode',async()=>{
 vi.stubGlobal('Worker',LayoutWorker)
 const data=page(),signal=new AbortController().signal,pending=loadOrganizationMapLayout(data,'3d',signal),worker=LayoutWorker.instances[0]
 expect(worker.postMessage).toHaveBeenCalledWith({data,mode:'3d'})
 const expected=organizationMapLayout(data,'3d');worker.onmessage!({data:expected})
 const result=await pending;expect(worker.terminate).toHaveBeenCalledOnce();result[0].x=999
 const cached=await loadOrganizationMapLayout(data,'3d',signal);expect(cached[0].x).toBe(0);expect(LayoutWorker.instances).toHaveLength(1)
 cached[1].x=999;expect((await loadOrganizationMapLayout(data,'3d',signal))[1].x).not.toBe(999)
 const planar=loadOrganizationMapLayout(data,'2d',signal);expect(LayoutWorker.instances).toHaveLength(2)
 LayoutWorker.instances[1].onmessage!({data:organizationMapLayout(data,'2d')});expect((await planar).every(n=>n.z===0)).toBe(true)
})
it('terminates cancelled work and refuses a stale result or a pre-aborted request',async()=>{
 vi.stubGlobal('Worker',LayoutWorker)
 const data=page(),controller=new AbortController(),pending=loadOrganizationMapLayout(data,'3d',controller.signal),worker=LayoutWorker.instances[0],late=worker.onmessage!
 const rejection=expect(pending).rejects.toMatchObject({name:'AbortError'})
 controller.abort();late({data:organizationMapLayout(data,'3d')});await rejection;expect(worker.terminate).toHaveBeenCalled()
 await expect(loadOrganizationMapLayout(data,'3d',controller.signal)).rejects.toMatchObject({name:'AbortError'})
 expect(LayoutWorker.instances).toHaveLength(1)
 const retry=loadOrganizationMapLayout(data,'3d',new AbortController().signal);expect(LayoutWorker.instances).toHaveLength(2)
 LayoutWorker.instances[1].onmessage!({data:organizationMapLayout(data,'3d')});await retry
})
it('releases failed workers and permits retry',async()=>{
 vi.stubGlobal('Worker',LayoutWorker)
 const data=page(),signal=new AbortController().signal
 for(const failure of ['onerror','onmessageerror'] as const){
  const pending=loadOrganizationMapLayout(data,'3d',signal),worker=LayoutWorker.instances.at(-1)!
  const rejection=expect(pending).rejects.toThrow(/Retry/);worker[failure]!();await rejection;expect(worker.terminate).toHaveBeenCalledOnce()
 }
 const pending=loadOrganizationMapLayout(data,'3d',signal);LayoutWorker.instances.at(-1)!.onmessage!({data:organizationMapLayout(data,'3d')});await pending
})
it('keeps small layouts synchronous and protects cached coordinates from renderer mutations',async()=>{
 vi.stubGlobal('Worker',LayoutWorker)
 const data=page(3),signal=new AbortController().signal,layout=await loadOrganizationMapLayout(data,'2d',signal)
 layout[0].renderRadius=999;expect((await loadOrganizationMapLayout(data,'2d',signal))[0].renderRadius).not.toBe(999)
 expect(LayoutWorker.instances).toHaveLength(0)
})
it('keeps particle layouts off the main thread and caches each spacing separately',async()=>{
 vi.stubGlobal('Worker',LayoutWorker)
 const data=page(3),signal=new AbortController().signal,options={layout:'hubs' as const,hubSpacing:1}
 const first=loadOrganizationMapLayout(data,'2d',signal,options),worker=LayoutWorker.instances[0]
 expect(worker.postMessage).toHaveBeenCalledWith({data,mode:'2d',options})
 worker.onmessage!({data:organizationMapLayout(data,'2d',options)});await first
 await loadOrganizationMapLayout(data,'2d',signal,options);expect(LayoutWorker.instances).toHaveLength(1)
 const changed=loadOrganizationMapLayout(data,'2d',signal,{...options,hubSpacing:1.5});expect(LayoutWorker.instances).toHaveLength(2)
 LayoutWorker.instances[1].onmessage!({data:organizationMapLayout(data,'2d',{...options,hubSpacing:1.5})});await changed
})
