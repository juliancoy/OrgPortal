import type {MapNode,MapPage} from './organizationMap'
import type {CameraView} from './webgpu-3d-renderer.js'
export type OrganizationMapColorScheme='category'|'volume'
export type OrganizationMapView={titlePlacement?:'floating'|'surface';colorScheme?:OrganizationMapColorScheme;mode:'2d'|'3d';navigation:'orbit'|'fly';speed:number;viewportTop?:number;planarWidth?:number;camera?:CameraView}
export const defaultOrganizationMapView:OrganizationMapView={mode:'2d',navigation:'orbit',speed:1}
export function organizationNodePath(node:Pick<MapNode,'id'|'slug'>){
 return node.slug?`/orgs/${encodeURIComponent(node.slug)}`:`/ecosystem/organizations/${encodeURIComponent(node.id)}`
}
export function largestOrganizationParent(data:MapPage):MapNode|null {
 const parents=new Set(data.relationships.filter(edge=>edge.target===data.anchor&&edge.source!==data.anchor).map(edge=>edge.source))
 const volume=(node:MapNode)=>typeof node.financialAmount==='number'&&Number.isFinite(node.financialAmount)&&node.financialAmount>=0?node.financialAmount:-1
 // Prefer disclosed amounts; use a stable ID tie-break for equal/unknown volumes.
 return data.organizations.filter(node=>parents.has(node.id)).sort((a,b)=>volume(b)-volume(a)||a.id.localeCompare(b.id))[0]||(data.hiddenParent?.id!==data.anchor?data.hiddenParent:null)||null
}
// Keep each visited map's view when going back/forward, without storing organization data.
const visited=new Map<string,OrganizationMapView>()
export function visitedMapView(key:string){return visited.get(key)}
export function rememberMapView(key:string,view:OrganizationMapView){
 visited.delete(key);visited.set(key,view)
 if(visited.size>100)visited.delete(visited.keys().next().value!)
}
