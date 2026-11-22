import {useEffect,useRef,useState} from 'react'
import {mountNetworkFullscreen} from '../../features/ecosystem/network-fullscreen'
import {Link,useLocation,useNavigate} from 'react-router-dom'
import {ecosystemUrl} from '../../features/ecosystem/ecosystemApi'
import {readEvidenceResponse} from '../../features/ecosystem/readEvidenceResponse.js'
import {loadOrganizationMap,type MapNode,type MapPage} from '../../features/ecosystem/organizationMap'
import {OrganizationMapCanvas,type OrganizationMapMode} from './OrganizationMapCanvas'
import {defaultOrganizationMapView,organizationNodePath,rememberMapView,visitedMapView,type OrganizationMapView} from '../../features/ecosystem/organizationMapNavigation'
import './organization-ecomap.css'
import {useOrganizationGrouping} from './OrganizationGrouping'
import {useOrganizationYear} from '../../features/ecosystem/organizationYear'
// Cache only complete, snapshot-consistent neighborhoods, with a short lifetime and memory bound.
const neighborhoods=new Map<string,{data:MapPage;at:number}>()
function cacheNeighborhood(handle:string,data:MapPage){
 neighborhoods.delete(handle);neighborhoods.set(handle,{data,at:Date.now()})
 let count=[...neighborhoods.values()].reduce((sum,item)=>sum+item.data.organizations.length,0)
 while(neighborhoods.size>12||count>20000){const key=neighborhoods.keys().next().value!;count-=neighborhoods.get(key)!.data.organizations.length;neighborhoods.delete(key)}
}
export function OrganizationEcoMap({organization}:{organization:{id:string;name:string;slug:string}}) {
 const fullscreenHost=useRef<HTMLElement>(null)
 useEffect(()=>{if(fullscreenHost.current)return mountNetworkFullscreen(fullscreenHost.current)},[])
 const {fy,setYear}=useOrganizationYear()
 const grouping=useOrganizationGrouping(),members=grouping.group?.members.length?JSON.stringify(grouping.group.members):undefined
 const handle=grouping.group?.slug||organization.slug,cacheKey=JSON.stringify([handle,members,fy])
 const location=useLocation(),navigate=useNavigate()
 const [initialView]=useState<OrganizationMapView>(()=>visitedMapView(location.key)||location.state?.organizationMapView||defaultOrganizationMapView)
 const [mode,setMode]=useState<OrganizationMapMode>(initialView.mode)
 const [result,setResult]=useState<{slug:string;key:string;fy:string;data:MapPage}|null>(null),[error,setError]=useState(''),[progress,setProgress]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{
  if(!grouping.ready)return
  const abort=new AbortController();setError('');setProgress('Loading direct connections…')
  const cached=neighborhoods.get(cacheKey)
  if(cached&&Date.now()-cached.at<60000){setResult({slug:organization.slug,key:cacheKey,fy,data:cached.data});setProgress('');return()=>abort.abort()}
  void loadOrganizationMap(async(offset,version)=>{const response=await fetch(ecosystemUrl('organization-map',{org:handle,members,fy,offset,limit:250,version}),{signal:abort.signal,credentials:'omit'});return readEvidenceResponse<MapPage>(response)},(loaded,total)=>{if(!abort.signal.aborted)setProgress(`Loading connections: ${loaded} of ${total}`)}).then(data=>{if(!abort.signal.aborted){if(!data.anchor)data={...data,anchor:organization.id,organizations:[{...organization,category:'general'}]};cacheNeighborhood(cacheKey,data);setResult({slug:organization.slug,key:cacheKey,fy,data});setProgress('')}}).catch(error=>{if(!abort.signal.aborted){setError(error.message);setProgress('')}})
  return()=>abort.abort()
 },[organization.id,organization.name,organization.slug,revision,grouping.ready,handle,members,cacheKey,fy])
 // Keep the renderer and display preferences alive while another year loads.
 // The previous map and its bubbles retain their own year until replaced.
 const data=result?.data||null
 const years=[...new Set([2025,...(result?.data.fiscalYears||[]),...(/^\d{4}$/.test(fy)?[Number(fy)]:[])])].sort((a,b)=>b-a)
 const updating=Boolean(data&&(result?.slug!==organization.slug||result?.key!==cacheKey||result?.fy!==fy))
 const anchor=data?.organizations.find(node=>node.id===data.anchor)
 const name=anchor?.name||organization.name
 const mapPath=mode==='3d'?'/ecosystem/network/3d':'/ecosystem/network'
 const mapUrl=`${mapPath}?${new URLSearchParams({org:data?.anchor||organization.id,direction:'both',depth:'1',fy})}`
 const yearControl=<label className="organization-ecomap-year">Fiscal year <select aria-label="Fiscal year" value={fy} onChange={event=>setYear(event.target.value)}><option value="all">All years</option>{years.map(year=><option key={year} value={year}>FY{year}</option>)}<option value="unassigned">Year unavailable</option></select></label>
 return <section ref={fullscreenHost} className="organization-ecomap" aria-label={`EcoMap for ${name}`}>
  <div className="organization-ecomap-heading"><h2>Relationship EcoMap{anchor&&<> · {anchor.name}</>}</h2>{data&&<Link to={mapUrl}>Open full EcoMap ↗</Link>}</div>
  {!data&&yearControl}
  {error&&<p role="alert">{error} <button onClick={event=>{neighborhoods.delete(cacheKey);setRevision(n=>n+1);event.currentTarget.closest('.organization-ecomap')?.querySelector('canvas')?.focus({preventScroll:true})}}>Retry map</button></p>}
  {!data&&progress&&<p role="status">{progress}</p>}
  {data&&<>
   <div className="organization-ecomap-summary"><p role="status" aria-live="polite">{updating?(error?'Showing previous connections; update failed.':`Updating connections… ${progress}`):data.total?`All ${data.total.toLocaleString()} adjacent nodes · ${data.incoming.toLocaleString()} upstream · ${data.outgoing.toLocaleString()} downstream`:fy==='all'?'No documented adjacent nodes in this snapshot.':fy==='unassigned'?'No connections among records without an assigned year.':`No documented connections for FY${fy}.`}</p><div className="organization-ecomap-legend"><span className="incoming">● Incoming</span><span className="outgoing">● Outgoing</span><span>Dashed: affiliation</span></div></div>
   {!updating&&data.hiddenParent&&<p>Click the selected node to return to {data.hiddenParent.name}. Its incoming link is outside this year filter; navigation keeps your selected year.</p>}
   <OrganizationMapCanvas yearControl={yearControl} data={data} mode={mode} initialView={initialView} onModeChange={setMode} onSelect={(node:MapNode,view)=>{
    rememberMapView(location.key,view)
    navigate(`${organizationNodePath(node)}?${new URLSearchParams({fy})}`,{state:{organizationMapView:view}})
   }}/>

   <p className="muted organization-ecomap-note">Dashed organizational arrows run from the state or parent to its departments and agencies, including in year-filtered views; they do not assert a payment. Parent size and dollar-volume color include consolidated department transfers, excluding internal transfers. Other lines group records in one direction.</p>
  </>}
 </section>
}
