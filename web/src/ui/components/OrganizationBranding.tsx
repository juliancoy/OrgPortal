import { useAuth } from '../../app/AppProviders'
import { compressUploadImage } from './compressUploadImage'
import { invalidatePublicOrganizationData } from '../../data/publicOrganization/cache'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getGroupSite, parseGroupSite, setGroupSite, type GroupSite } from '../../config/timebankCommunity'
import { applyPortalBranding } from '../../config/portalBranding'
import { parseOrganizationThemes, standardOrganizationThemes, type OrganizationThemeImagery } from '../../../../shared/organizationThemes'
import { TenantBrandingPage } from '../views/TenantBrandingPage'

export const organizationBrandingPath=(slug:string)=>`/orgs/${encodeURIComponent(slug)}?tab=branding`
type Organization={id:string;slug:string;name:string;description?:string|null;image_url?:string|null}
type Props={organization:Organization;canManage?:boolean;onSaved?:()=>void;onPreview?:(site:GroupSite,avatar:string)=>void;embedded?:boolean}
const roles=['icon','avatar','background'] as const
const emptyFiles={icon:null,avatar:null,background:null}
type Draft={tagline:string;accent:string;themeId:string;imagery:OrganizationThemeImagery;files:Record<keyof OrganizationThemeImagery,File|null>}
export function OrganizationBranding(props:Props){return <BrandingEditor key={`${props.organization.id}:${props.organization.slug}`} {...props}/>}
function BrandingEditor({organization,canManage=false,onSaved,onPreview,embedded=false}:Props) {
 const {token}=useAuth()
 const [draft,setDraft]=useState<Draft>({tagline:'',accent:'#155e59',themeId:'harbor',imagery:standardOrganizationThemes[0].imagery!,files:emptyFiles})
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false)
 const [result,setResult]=useState<{site:GroupSite|null}|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[retry,setRetry]=useState(0)
 const version=useRef(0),savedVersion=useRef(0),attemptedVersion=useRef(0),mounted=useRef(true)
 const callbacks=useRef({onSaved,onPreview});callbacks.current={onSaved,onPreview}
 const flush=useRef<(()=>void)|null>(null),queued=useRef<(()=>void)|null>(null),saving=useRef(false)
 const persisted=useRef<{site:GroupSite;avatar:string}|null>(null)
 function change(update:Partial<Draft>){version.current++;setFailed(false);setMessage('Changes pending…');setDraft(previous=>({...previous,...update}))}
 const previews=useMemo(()=>Object.fromEntries(roles.filter(role=>draft.files[role]).map(role=>[role,URL.createObjectURL(draft.files[role]!)])),[draft.files])
 useEffect(()=>()=>Object.values(previews).forEach(url=>URL.revokeObjectURL(url)),[previews])
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;flush.current?.();const saved=persisted.current;if(saved){callbacks.current.onPreview?.(saved.site,saved.avatar);const tenant=getGroupSite();if(tenant?.organization_id===organization.id){setGroupSite({...tenant,...saved.site,hostname:tenant.hostname});applyPortalBranding()}}}},[organization.id])
 useEffect(()=>{
  const controller=new AbortController();setError('');setResult(null)
  void fetch(`/api/org/api/network/orgs/public/${encodeURIComponent(organization.slug)}/branding`,{signal:controller.signal,cache:'no-store'}).then(async response=>{
   if(!response.ok)throw new Error('Could not load this organization’s branding.')
   const data=await response.json();const site=data.portal?parseGroupSite(data.portal):null
   if(data.portal&&!site)throw new Error('The organization branding configuration is invalid.')
   if(!controller.signal.aborted){
    const config=parseOrganizationThemes(site?.feature_config?.brandThemes),theme=config?.themes.find(item=>item.id===config.defaultTheme)||standardOrganizationThemes[0]
    const images=theme.imagery||standardOrganizationThemes[0].imagery!
    setDraft({tagline:site?.tagline??'',accent:site?.accent_color||theme.light.primary,themeId:theme.id,imagery:{icon:site?.brand_image_path||images.icon,avatar:(config?theme.imagery?.avatar:null)||organization.image_url||images.avatar,background:site?.home_image_url||images.background},files:emptyFiles})
    version.current=0;savedVersion.current=0;attemptedVersion.current=0;setResult({site})
   }
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message)})
  return()=>controller.abort()
 },[organization.id,organization.slug,revision])
 const configured=parseOrganizationThemes(result?.site?.feature_config?.brandThemes)
 const themes=[...new Map([...(configured?.themes||[]),...standardOrganizationThemes.map(preset=>configured?.themes.find(theme=>theme.id===preset.id)||preset)].map(theme=>[theme.id,theme])).values()]
 const baseSite:GroupSite=result?.site||{id:organization.id,organization_id:organization.id,slug:organization.slug,hostname:window.location.hostname,name:organization.name,tagline:'',accent_color:'#155e59',brand_image_path:organization.image_url||'/images/org-placeholder.svg',home_url:new URL(`/orgs/${encodeURIComponent(organization.slug)}`,window.location.origin).href}
 function buildSite(images:OrganizationThemeImagery):GroupSite{
  const selected=themes.find(theme=>theme.id===draft.themeId)!
  return {...baseSite,tagline:draft.tagline,accent_color:draft.accent,brand_image_path:images.icon,home_image_url:images.background,feature_config:{...baseSite.feature_config,brandThemes:{defaultTheme:draft.themeId,themes:themes.map(theme=>theme.id===draft.themeId?{...selected,light:{...selected.light,primary:draft.accent},imagery:images}:theme)}}}
 }
 function changeTheme(id:string){const theme=themes.find(item=>item.id===id)!;change({themeId:theme.id,accent:theme.light.primary,imagery:theme.imagery||standardOrganizationThemes[0].imagery!,files:emptyFiles})}
 const previewSite=useMemo(()=>result?(canManage&&token?{...buildSite(draft.imagery),brand_image_path:previews.icon||draft.imagery.icon,home_image_url:previews.background||draft.imagery.background}:baseSite):null,[draft,previews,result,canManage,token])
 useEffect(()=>{
  if(!previewSite||!canManage||!token)return
  if(!persisted.current)persisted.current={site:previewSite,avatar:draft.imagery.avatar}
  callbacks.current.onPreview?.(previewSite,previews.avatar||draft.imagery.avatar)
  const tenant=getGroupSite();if(tenant?.organization_id===organization.id){setGroupSite({...tenant,...previewSite,hostname:tenant.hostname});applyPortalBranding()}
 },[previewSite,organization.id])
 useEffect(()=>{
  if(!result||!token||!canManage||version.current===savedVersion.current||attemptedVersion.current===version.current)return
  const currentVersion=version.current
  let started=false
  const save=()=>{
   if(started)return
   if(saving.current){queued.current=save;return}
   started=true;saving.current=true
   attemptedVersion.current=currentVersion;if(mounted.current){setBusy(true);setMessage('Saving branding…')}
   const base=`/api/org/api/network/orgs/${encodeURIComponent(organization.id)}`
   async function request(url:string,method:string,body:BodyInit,json=false){
    const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,...(json?{'Content-Type':'application/json'}:{})},body})
    const data=await response.json();if(!response.ok)throw new Error(data.detail||data.message||data.error||'Could not save branding.');return data
   }
   void(async()=>{
    try{
     const images={...draft.imagery}
     for(const role of roles){
      if(draft.files[role]){
       const file=await compressUploadImage(draft.files[role]!);if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>8*1024*1024)throw new Error('Choose a JPEG, PNG, WebP or GIF up to 8 MB after compression.')
       const form=new FormData();form.set('image',file);form.set('label',`${organization.name} ${role}`)
       const uploaded=await request(`${base}/media`,'POST',form),path=uploaded.media?.at(-1)?.url;if(!path)throw new Error('Uploaded image is unavailable.')
       images[role]=path.startsWith('/api/network/')?`/api/org${path}`:path
      }
      images[role]=new URL(images[role],window.location.origin).href
     }
     const site=buildSite(images)
     await request(base,'PATCH',JSON.stringify({image_url:images.avatar}),true)
     await request(`${base}/portal`,'PUT',JSON.stringify({...site,slug:site.slug||organization.slug,home_kind:site.home_kind||'org',brandThemes:site.feature_config!.brandThemes}),true)
     persisted.current={site,avatar:images.avatar};savedVersion.current=currentVersion
     await invalidatePublicOrganizationData()
     if(mounted.current){
      // Keep newer keystrokes and theme selections when a previous save finishes.
      if(version.current===currentVersion){setDraft({...draft,imagery:images,files:emptyFiles});setResult({site});setFailed(false);setMessage('All changes saved.')}
      else setMessage('Saving latest changes…')
      callbacks.current.onSaved?.()
     }
    }catch(reason){if(mounted.current){setFailed(true);setMessage(reason instanceof Error?reason.message:'Could not save branding.')}}finally{saving.current=false;const next=queued.current;queued.current=null;if(next)next();else if(mounted.current)setBusy(false)}
   })()
  }
  flush.current=save
  const timer=window.setTimeout(save,600)
  return()=>{window.clearTimeout(timer);if(flush.current===save)flush.current=null}
 },[draft,result,token,canManage,busy,retry])
 // Warn on closing the tab only when there are edits the server has not confirmed.
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(version.current!==savedVersion.current){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[])
 if(error)return <p role="alert">{error} <button className="btn-secondary" onClick={()=>setRevision(value=>value+1)}>Retry branding</button></p>
 if(!result||!previewSite)return <p role="status">Loading organization branding…</p>
 return <>
 {canManage&&token&&<form className="portal-card organization-brand-editor" aria-label="Edit organization branding" onSubmit={event=>event.preventDefault()}>
 <h2>Edit organization branding</h2>
 <p>Changes save automatically. Your imagery and brand guide update as you edit.</p>
 <fieldset><legend className="sr-only">Organization identity</legend>
 <label>Organization theme<select aria-label="Organization theme" value={draft.themeId} onChange={event=>changeTheme(event.target.value)}>{themes.map(theme=><option value={theme.id} key={theme.id}>{theme.name}</option>)}</select></label>
 <label>Tagline<input maxLength={180} value={draft.tagline} onChange={event=>change({tagline:event.target.value})}/></label>
 <label>Brand color<input type="color" value={draft.accent} onChange={event=>change({accent:event.target.value})}/></label>
 <div className="organization-brand-imagery">{roles.map(role=><div className={`organization-brand-image organization-brand-image-${role}`} key={role}>
 <img src={previews[role]||draft.imagery[role]} alt={`${role} preview`}/>
 <label>{role[0].toUpperCase()+role.slice(1)} image<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={event=>change({files:{...draft.files,[role]:event.target.files?.[0]||null}})}/></label>
 <small>{role==='icon'?'Navigation and favicon':role==='avatar'?'Organization profile and directory':'Organization cover and standard backdrop'}</small>
 </div>)}</div>
 <p>JPEG and PNG uploads are compressed automatically; transparency is preserved. Maximum 8 MB per image after compression.</p>
 </fieldset>
 <p role="status" aria-live="polite">{message||'All changes saved.'}</p>
 {failed&&<button type="button" className="btn-secondary" onClick={()=>{attemptedVersion.current=0;setRetry(value=>value+1)}}>Retry saving branding</button>}
 </form>}
 <TenantBrandingPage embedded={embedded} tenant={previewSite} imageryOverride={canManage?{...draft.imagery,...previews}:undefined} selectedThemeId={canManage?draft.themeId:undefined} onThemeChange={canManage?changeTheme:undefined} brandGuidePath={organizationBrandingPath(organization.slug)} />
 </>
}
