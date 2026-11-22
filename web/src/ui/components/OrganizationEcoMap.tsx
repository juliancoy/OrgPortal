import {useEffect,useState} from 'react'
import {Link,useLocation,useNavigate} from 'react-router-dom'
import {ecosystemUrl} from '../../features/ecosystem/ecosystemApi'
import {readEvidenceResponse} from '../../features/ecosystem/readEvidenceResponse.js'
import {loadOrganizationMap,type MapNode,type MapPage} from '../../features/ecosystem/organizationMap'
import {OrganizationMapCanvas,type OrganizationMapMode} from './OrganizationMapCanvas'
import {defaultOrganizationMapView,organizationNodePath,rememberMapView,visitedMapView,type OrganizationMapView} from '../../features/ecosystem/organizationMapNavigation'
import './organization-ecomap.css'
export function OrganizationEcoMap({organization}:{organization:{id:string;name:string;slug:string}}) {
 const location=useLocation(),navigate=useNavigate()
 const [initialView]=useState<OrganizationMapView>(()=>visitedMapView(location.key)||location.state?.organizationMapView||defaultOrganizationMapView)
 const [mode,setMode]=useState<OrganizationMapMode>(initialView.mode)
 const [result,setResult]=useState<{slug:string;data:MapPage}|null>(null),[error,setError]=useState(''),[progress,setProgress]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{
  const abort=new AbortController();setError('');setProgress('Loading direct connections…')
  void loadOrganizationMap(async(offset,version)=>{const response=await fetch(ecosystemUrl('organization-map',{org:organization.slug,offset,limit:250,version}),{signal:abort.signal,credentials:'omit'});return readEvidenceResponse<MapPage>(response)},(loaded,total)=>{if(!abort.signal.aborted)setProgress(`Loading connections: ${loaded} of ${total}`)}).then(data=>{if(!abort.signal.aborted){if(!data.anchor)data={...data,anchor:organization.id,organizations:[{...organization,category:'general'}]};setResult({slug:organization.slug,data});setProgress('')}}).catch(error=>{if(!abort.signal.aborted){setError(error.message);setProgress('')}})
  return()=>abort.abort()
 },[organization.id,organization.name,organization.slug,revision])
 const data=result?.slug===organization.slug?result.data:null
 const mapPath=mode==='3d'?'/ecosystem/network/3d':'/ecosystem/network'
 const mapUrl=`${mapPath}?${new URLSearchParams({org:data?.anchor||organization.id,direction:'both',depth:'1'})}`
 return <section className="organization-ecomap" aria-label={`EcoMap for ${organization.name}`}>
  <div className="organization-ecomap-heading"><div><h2>Relationship EcoMap</h2><p>Direct upstream and downstream connections · arrows follow recorded relationships. Click a node to open its page.</p></div>{data&&<Link to={mapUrl}>Open full EcoMap ↗</Link>}</div>
  <div className="organization-ecomap-legend"><span className="incoming">● Incoming</span><span className="outgoing">● Outgoing</span><span>Dashed: organizational affiliation</span></div>
  {error?<p role="alert">{error} <button onClick={()=>{setResult(null);setRevision(n=>n+1)}}>Retry map</button></p>:progress?<p role="status">{progress}</p>:data&&<>
   <p role="status">{data.total?`All ${data.total.toLocaleString()} adjacent nodes · ${data.incoming.toLocaleString()} upstream · ${data.outgoing.toLocaleString()} downstream`:'No documented adjacent nodes in this snapshot.'}</p>
   <OrganizationMapCanvas data={data} mode={mode} initialView={initialView} onModeChange={setMode} onSelect={(node:MapNode,view)=>{
    rememberMapView(location.key,view)
    navigate(organizationNodePath(node),{state:{organizationMapView:view}})
   }}/>

   <p className="muted organization-ecomap-note">Each line groups records in one direction; it does not add their monetary amounts.</p>
  </>}
 </section>
}
