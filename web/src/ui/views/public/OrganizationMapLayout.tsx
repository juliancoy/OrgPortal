import {Suspense} from 'react'
import {Outlet,useParams} from 'react-router-dom'
import {OrganizationEcoMap} from '../../components/OrganizationEcoMap'
import {OrganizationGrouping,OrganizationGroupingProvider} from '../../components/OrganizationGrouping'

/** Both directory and evidence routes share one live canvas. Profile loading stays below it. */
export function OrganizationMapLayout(){
 const {handle,nodeId}=useParams(),reference=handle||nodeId||''
 return <OrganizationGroupingProvider reference={reference}><div className="portal-org-page organization-map-layout" data-brand-theme="configured">
  <OrganizationEcoMap organization={{id:reference,slug:reference,name:reference}}/>
  <OrganizationGrouping/>
  <Suspense fallback={<p role="status">Loading organization details…</p>}><Outlet/></Suspense>
 </div></OrganizationGroupingProvider>
}
