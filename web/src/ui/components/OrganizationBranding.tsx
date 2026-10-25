import { useAuth } from '../../app/AppProviders'
import { compressUploadImage } from './compressUploadImage'
import { invalidatePublicOrganizationData } from '../../data/publicOrganization/cache'
import { useEffect, useState } from 'react'
import { parseGroupSite, type GroupSite } from '../../config/timebankCommunity'
import { TenantBrandingPage } from '../views/TenantBrandingPage'

export const organizationBrandingPath=(slug:string)=>`/orgs/${encodeURIComponent(slug)}?tab=branding`
type Organization={id:string;slug:string;name:string;description?:string|null;image_url?:string|null}
export function OrganizationBranding({organization,canManage=false}:{organization:Organization;canManage?:boolean}) {
 const {token}=useAuth()
 const [tagline,setTagline]=useState(''),[accent,setAccent]=useState('#155e59'),[image,setImage]=useState<File|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const [result,setResult]=useState<{slug:string;site:GroupSite|null}|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{
  const controller=new AbortController();setError('');setResult(null)
  void fetch(`/api/org/api/network/orgs/public/${encodeURIComponent(organization.slug)}/branding`,{signal:controller.signal,cache:'no-store'}).then(async response=>{
   if(!response.ok)throw new Error('Could not load this organization’s branding.')
   const data=await response.json();const site=data.portal?parseGroupSite(data.portal):null
   if(data.portal&&!site)throw new Error('The organization branding configuration is invalid.')
   if(!controller.signal.aborted){setResult({slug:organization.slug,site});setTagline(site?.tagline??'');setAccent(site?.accent_color||'#155e59')}
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
 return <>
 {canManage&&token&&<form className="portal-card" aria-label="Edit organization branding" onSubmit={async event=>{
  event.preventDefault();if(busy)return;setBusy(true);setMessage('');
  const base=`/api/org/api/network/orgs/${encodeURIComponent(organization.id)}`;
  async function request(url:string,method:string,body:BodyInit,json=false){
   const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,...(json?{'Content-Type':'application/json'}:{})},body});
   const data=await response.json();if(!response.ok)throw new Error(data.detail||data.message||data.error||'Could not save branding.');return data;
  }
  try{
   let imageUrl=site.brand_image_path;
   if(image){const file=await compressUploadImage(image);if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>8*1024*1024)throw new Error('Choose a JPEG, PNG, WebP or GIF up to 8 MB after compression.');
    const form=new FormData();form.set('image',file);const uploaded=await request(`${base}/media`,'POST',form);
    const path=uploaded.media?.at(-1)?.url;if(!path)throw new Error('Uploaded image is unavailable.');
    imageUrl=new URL(path.startsWith('/api/network/')?`/api/org${path}`:path,window.location.origin).href;
    await request(base,'PATCH',JSON.stringify({image_url:imageUrl}),true);setImage(null);
   }
   await request(`${base}/portal`,'PUT',JSON.stringify({...result.site,slug:result.site?.slug||organization.slug,name:site.name,tagline,accent_color:accent,home_image_url:imageUrl,home_kind:result.site?.home_kind||'org'}),true);
   await invalidatePublicOrganizationData();setRevision(value=>value+1);setMessage('Branding saved.');
  }catch(reason){setMessage(reason instanceof Error?reason.message:'Could not save branding.')}finally{setBusy(false)}
 }}>
 <h2>Edit organization branding</h2>
 <fieldset disabled={busy} className="presentation-fields"><legend className="sr-only">Organization identity</legend>
 <label>Tagline<input maxLength={180} value={tagline} onChange={event=>setTagline(event.target.value)}/></label>
 <label>Brand color<input type="color" value={accent} onChange={event=>setAccent(event.target.value)}/></label>
 <label>Organization image<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={event=>setImage(event.target.files?.[0]||null)}/></label>
 <p>JPEG and PNG images are compressed before upload. Transparency is preserved. Maximum 8 MB after compression.</p>
 <button className="btn-primary" type="submit">{busy?'Saving branding…':'Save branding'}</button>
 </fieldset>
 </form>}
 {message&&<p role="status">{message}</p>}
 <TenantBrandingPage tenant={site} brandGuidePath={organizationBrandingPath(organization.slug)} />
 </>
}
