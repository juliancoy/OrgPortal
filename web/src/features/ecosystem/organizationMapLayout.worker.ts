import {organizationMapLayout,type MapPage,type PositionedNode} from './organizationMap'

const worker=self as unknown as {
 onmessage:((event:MessageEvent<{data:MapPage;mode:'2d'|'3d'}>)=>void)|null
 postMessage:(nodes:PositionedNode[])=>void
}
worker.onmessage=({data:{data,mode}})=>worker.postMessage(organizationMapLayout(data,mode))
