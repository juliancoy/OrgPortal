import { useAuth } from '../../app/AppProviders'
import { compressUploadImage } from './compressUploadImage'
import { invalidatePublicOrganizationData } from '../../data/publicOrganization/cache'
import { useEffect, useState } from 'react'
import { parseGroupSite, type GroupSite } from '../../config/timebankCommunity'
import { parseOrganizationThemes, standardOrganizationThemes, type OrganizationThemeImagery } from '../../../../shared/organizationThemes'
import { TenantBrandingPage } from '../views/TenantBrandingPage'

export const organizationBrandingPath=(slug:string)=>`/orgs/${encodeURIComponent(slug)}?tab=branding`
type Organization={id:string;slug:string;name:string;description?:string|null;image_url?:string|null}
const roles=['icon','avatar','background'] as const
const emptyFiles={icon:null,avatar:null,background:null}
export function OrganizationBranding({organization,canManage=false,onSaved,embedded=false}:{organization:Organization;canManage?:boolean;onSaved?:()=>void;embedded?:boolean}) {
 const {token}=useAuth()
 const [tagline,setTagline]=useState(''),[accent,setAccent]=useState('#155e59'),[themeId,setThemeId]=useState(standardOrganizationThemes[0].id)
 const [imagery,setImagery]=useState<OrganizationThemeImagery>(standardOrganizationThemes[0].imagery!)
 const [files,setFiles]=useState<Record<keyof OrganizationThemeImagery,File|null>>(emptyFiles),[previews,setPreviews]=useState<Record<string,string>>({})
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const [result,setResult]=useState<{slug:string;site:GroupSite|null}|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{setFiles(emptyFiles);setMessage('')},[organization.id])
 useEffect(()=>{const urls=Object.fromEntries(roles.filter(role=>files[role]).map(role=>[role,URL.createObjectURL(files[role]!)]));setPreviews(urls);return()=>Object.values(urls).forEach(url=>URL.revokeObjectURL(url))},[files])
 useEffect(()=>{
  const controller=new AbortController();setError('');setResult(null)
  void fetch(`/api/org/api/network/orgs/public/${encodeURIComponent(organization.slug)}/branding`,{signal:controller.signal,cache:'no-store'}).then(async response=>{
   if(!response.ok)throw new Error('Could not load this organization’s branding.')
   const data=await response.json();const site=data.portal?parseGroupSite(data.portal):null
   if(data.portal&&!site)throw new Error('The organization branding configuration is invalid.')
   if(!controller.signal.aborted){
    const config=parseOrganizationThemes(site?.feature_config?.brandThemes),theme=config?.themes.find(item=>item.id===config.defaultTheme)||standardOrganizationThemes[0]
    setResult({slug:organization.slug,site});setTagline(site?.tagline??'');setAccent(site?.accent_color||theme.light.primary);setThemeId(theme.id)
    const images=theme.imagery||standardOrganizationThemes[0].imagery!
    setImagery({icon:site?.brand_image_path||images.icon,avatar:(config?theme.imagery?.avatar:null)||organization.image_url||images.avatar,background:site?.home_image_url||images.background})
   }
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message)})
  return()=>controller.abort()
 },[organization.id,organization.slug,revision])
 if(error)return <p role="alert">{error} <button className="btn-secondary" onClick={()=>setRevision(value=>value+1)}>Retry branding</button></p>
 if(result?.slug!==organization.slug)return <p role="status">Loading organization branding…</p>
 const configured=parseOrganizationThemes(result.site?.feature_config?.brandThemes)
 const themes=configured?.themes || standardOrganizationThemes
 const site:GroupSite=result.site||{id:organization.id,organization_id:organization.id,slug:organization.slug,hostname:window.location.hostname,name:organization.name,tagline:'',accent_color:'#155e59',brand_image_path:organization.image_url||'/images/org-placeholder.svg',home_url:new URL(`/orgs/${encodeURIComponent(organization.slug)}`,window.location.origin).href}
 return <>
 {canManage&&token&&<form className="portal-card organization-brand-editor" aria-label="Edit organization branding" onSubmit={async event=>{
  event.preventDefault();if(busy)return;setBusy(true);setMessage('');
  const base=`/api/org/api/network/orgs/${encodeURIComponent(organization.id)}`
  async function request(url:string,method:string,body:BodyInit,json=false){
   const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,...(json?{'Content-Type':'application/json'}:{})},body})
   const data=await response.json();if(!response.ok)throw new Error(data.detail||data.message||data.error||'Could not save branding.');return data
  }
  try{
   const images={...imagery}
   for(const role of roles){
    if(files[role]){
     const file=await compressUploadImage(files[role]!);if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>8*1024*1024)throw new Error('Choose a JPEG, PNG, WebP or GIF up to 8 MB after compression.')
     const form=new FormData();form.set('image',file);form.set('label',`${organization.name} ${role}`)
     const uploaded=await request(`${base}/media`,'POST',form),path=uploaded.media?.at(-1)?.url;if(!path)throw new Error('Uploaded image is unavailable.')
     images[role]=path.startsWith('/api/network/')?`/api/org${path}`:path
     setImagery(previous=>({...previous,[role]:images[role]}));setFiles(previous=>({...previous,[role]:null}))
    }
    images[role]=new URL(images[role],window.location.origin).href
   }
   const selected=themes.find(theme=>theme.id===themeId)!
   const brandThemes={defaultTheme:themeId,themes:themes.map(theme=>theme.id===themeId?{...selected,light:{...selected.light,primary:accent},imagery:images}:theme)}
   await request(base,'PATCH',JSON.stringify({image_url:images.avatar}),true)
   await request(`${base}/portal`,'PUT',JSON.stringify({...result.site,slug:result.site?.slug||organization.slug,name:site.name,tagline,accent_color:accent,brand_image_path:images.icon,home_image_url:images.background,home_kind:result.site?.home_kind||'org',brandThemes}),true)
   await invalidatePublicOrganizationData();setRevision(value=>value+1);setMessage('Branding saved.');onSaved?.()
  }catch(reason){setMessage(reason instanceof Error?reason.message:'Could not save branding.')}finally{setBusy(false)}
 }}>
 <h2>Edit organization branding</h2>
 <fieldset disabled={busy}><legend className="sr-only">Organization identity</legend>
 <label>Organization theme<select aria-label="Organization theme" value={themeId} onChange={event=>{const theme=themes.find(item=>item.id===event.target.value)!;setThemeId(theme.id);setAccent(theme.light.primary);setImagery(theme.imagery||standardOrganizationThemes[0].imagery!);setFiles(emptyFiles)}}>{themes.map(theme=><option value={theme.id} key={theme.id}>{theme.name}</option>)}</select></label>
 <p>Choose a named theme, then customize its imagery. Save to set the organization’s default branding.</p>
 <label>Tagline<input maxLength={180} value={tagline} onChange={event=>setTagline(event.target.value)}/></label>
 <label>Brand color<input type="color" value={accent} onChange={event=>setAccent(event.target.value)}/></label>
 <div className="organization-brand-imagery">{roles.map(role=><div className={`organization-brand-image organization-brand-image-${role}`} key={role}>
 <img src={previews[role]||imagery[role]} alt={`${role} preview`}/>
 <label>{role[0].toUpperCase()+role.slice(1)} image<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={event=>setFiles(previous=>({...previous,[role]:event.target.files?.[0]||null}))}/></label>
 <small>{role==='icon'?'Navigation and favicon':role==='avatar'?'Organization profile and directory':'Organization cover and standard backdrop'}</small>
 </div>)}</div>
 <p>JPEG and PNG uploads are compressed automatically; transparency is preserved. Maximum 8 MB per image after compression.</p>
 <button className="btn-primary" type="submit">{busy?'Saving branding…':'Save branding'}</button>
 </fieldset>
 </form>}
 {message&&<p role="status">{message}</p>}
 <TenantBrandingPage embedded={embedded} tenant={site} brandGuidePath={organizationBrandingPath(organization.slug)} />
 </>
}
