import {Link,Navigate,useLocation,useParams} from 'react-router-dom'
import {useEcosystemQuery,type QueryMeta} from '../../../features/ecosystem/ecosystemApi'
import {OrganizationEvidence} from '../../components/OrganizationEvidence'

type Profile=QueryMeta&{organization:{id:string;name:string;slug:string|null}|null}
export function EcosystemOrganizationPage(){
 const {nodeId=''}=useParams(),location=useLocation()
 const {data,error}=useEcosystemQuery<Profile>('organization-group',{org:nodeId})
 if(error)return <section className="panel"><h1>Organization</h1><p role="alert">{error}</p><button onClick={()=>window.location.reload()}>Retry</button></section>
 if(!data)return <section className="panel" aria-busy="true"><p role="status">Loading organization…</p></section>
 const org=data.organization
 if(!org)return <section className="panel"><h1>Organization unavailable</h1><p>This node is not in the current evidence snapshot.</p><Link to="/orgs">Browse organizations</Link></section>
 if(org.slug)return <Navigate replace to={`/orgs/${encodeURIComponent(org.slug)}${location.search}`} state={location.state}/>
 return <section className="panel organization-profile"><header><h1>{org.name}</h1><p>Organization relationships and source evidence</p></header>
  <OrganizationEvidence key={org.id} slug={org.id}/>
 </section>
}
