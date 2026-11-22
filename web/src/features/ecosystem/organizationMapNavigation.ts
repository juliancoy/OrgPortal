import type {MapNode} from './organizationMap'
import type {CameraView} from './webgpu-3d-renderer.js'
export type OrganizationMapView={mode:'2d'|'3d';navigation:'orbit'|'fly';speed:number;viewportTop?:number;planarWidth?:number;camera?:CameraView}
export const defaultOrganizationMapView:OrganizationMapView={mode:'2d',navigation:'orbit',speed:1}
export function organizationNodePath(node:Pick<MapNode,'id'|'slug'>){
 return node.slug?`/orgs/${encodeURIComponent(node.slug)}`:`/ecosystem/organizations/${encodeURIComponent(node.id)}`
}
// Keep each visited map's view when going back/forward, without storing organization data.
const visited=new Map<string,OrganizationMapView>()
export function visitedMapView(key:string){return visited.get(key)}
export function rememberMapView(key:string,view:OrganizationMapView){
 visited.delete(key);visited.set(key,view)
 if(visited.size>100)visited.delete(visited.keys().next().value!)
}
