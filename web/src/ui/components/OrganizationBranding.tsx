import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { parseGroupSite, type GroupSite } from '../../config/timebankCommunity'
import { TenantBrandingPage } from '../views/TenantBrandingPage'

export const organizationBrandingPath=(slug:string)=>`/orgs/${encodeURIComponent(slug)}?tab=branding`
type Organization={id:string;slug:string;name:string;description?:string|null;image_url?:string|null}
export function OrganizationBranding({organization}:{organization:Organization}) {
 const [result,setResult]=useState<{slug:string;site:GroupSite|null}|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{
  const controller=new AbortController();setError('');setResult(null)
  void fetch(`/api/org/api/network/orgs/public/${encodeURIComponent(organization.slug)}/branding`,{signal:controller.signal,cache:'no-store'}).then(async response=>{
   if(!response.ok)throw new Error('Could not load this organization’s branding.')
   const data=await response.json();const site=data.portal?parseGroupSite(data.portal):null
   if(data.portal&&!site)throw new Error('The organization branding configuration is invalid.')
   if(!controller.signal.aborted)setResult({slug:organization.slug,site})
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message)})
  return()=>controller.abort()
 },[organization.slug,revision])
 if(error)return <p role="alert">{error} <button className="btn-secondary" onClick={()=>setRevision(value=>value+1)}>Retry branding</button></p>
 if(result?.slug!==organization.slug)return <p role="status">Loading organization branding…</p>
 const fallbackImage=organization.image_url||'/images/org-placeholder.svg'
 const site:GroupSite=result.site?{...result.site,brand_image_path:result.site.brand_image_path||fallbackImage}:{
  id:organization.id,organization_id:organization.id,slug:organization.slug,hostname:window.location.hostname,name:organization.name,
  tagline:'',accent_color:'#155e59',brand_image_path:fallbackImage,home_url:new URL(`/orgs/${encodeURIComponent(organization.slug)}`,window.location.origin).href,
 }
 return <TenantBrandingPage tenant={site} brandGuidePath={organizationBrandingPath(organization.slug)} />
}

/** Keep published portal links working while moving the canonical guide to its org. */
export function LegacyPortalBrandingRedirect(){
 const {tenantSlug}=useParams(),[slug,setSlug]=useState(''),[error,setError]=useState('')
 useEffect(()=>{
  const controller=new AbortController();setSlug('');setError('')
  void fetch(`/api/org/api/portal/sites/${encodeURIComponent(tenantSlug||'')}`,{signal:controller.signal}).then(async response=>{
   if(!response.ok)throw new Error('Organization branding not found.')
   const site=parseGroupSite(await response.json())
   if(!site?.home_org_slug)throw new Error('This portal has no linked organization.')
   if(!controller.signal.aborted)setSlug(site.home_org_slug)
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message)})
  return()=>controller.abort()
 },[tenantSlug])
 if(slug)return <Navigate to={organizationBrandingPath(slug)} replace />
 return <section className="panel"><p role={error?'alert':'status'}>{error||'Opening organization branding…'}</p></section>
}
