import {organizationMapLayout,type MapPage,type PositionedNode,type OrganizationMapLayoutOptions} from './organizationMap'

const worker=self as unknown as {
 onmessage:((event:MessageEvent<{data:MapPage;mode:'2d'|'3d';options?:OrganizationMapLayoutOptions}>)=>void)|null
 postMessage:(nodes:PositionedNode[])=>void
}
worker.onmessage=({data:{data,mode,options}})=>worker.postMessage(organizationMapLayout(data,mode,options))
