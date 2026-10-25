import { useAuth } from '../../app/AppProviders'
import { personnelSchemes, type PersonnelScheme } from '../../../../shared/organizationPersonnel'
import { OrganizationPersonnelScheme, usePersonnelScheme } from './OrganizationPersonnelScheme'
import { PersonnelInvitations } from './PersonnelInvitations'
import type {PersonnelClass} from '../../../../shared/organizationPersonnel'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { OrganizationAvatar, OrganizationPersonnelLegend } from './OrganizationAvatar'
import { OrganizationMembers } from './OrganizationMembers'
import './OrganizationBoard.css'

type Person={id:string;name:string;titles:string[];description?:string|null;photo_url:string|null;photo_source_url?:string|null;profile_slug:string|null;personnel_class:PersonnelClass;role_classes?:{scheme:PersonnelScheme;key:string}[];pendingInvitation?:boolean;deliveryStatus?:string}
export function OrganizationBoard({organization,canManage,canRead=false,memberType='community',embedded=false}:{organization:{id:string;slug:string;name:string;membership_count?:number};canManage:boolean;canRead?:boolean;memberType?:'community'|'team';embedded?:boolean}){
 const {token}=useAuth()
 const {scheme,error:schemeError}=usePersonnelScheme(organization.id)
 const label='Personnel'
 const Heading=embedded?'h2':'h1'
 const [people,setPeople]=useState<Person[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{
  const refresh=(event:Event)=>{if((event as CustomEvent).detail?.organizationId===organization.id)setRevision(value=>value+1)}
  window.addEventListener('organization-member-titles-updated',refresh)
  window.addEventListener('organization-invitations-updated',refresh)
  const focus=()=>setRevision(value=>value+1)
  window.addEventListener('focus',focus)
  return()=>{window.removeEventListener('organization-member-titles-updated',refresh);window.removeEventListener('organization-invitations-updated',refresh);window.removeEventListener('focus',focus)}
 },[organization.id])
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setPeople([]);setError('')
  void fetch(`/api/org/api/network/orgs/public/${encodeURIComponent(organization.slug)}/personnel`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   if(!response.ok)throw new Error(`Could not load organization ${label.toLowerCase()}.`)
   const data=await response.json();const people:Person[]=canManage&&token?data.people.filter((person:Person)=>!person.pendingInvitation):data.people
   if(canManage&&token){
    const invitations=await fetch(`/api/org/api/network/orgs/${encodeURIComponent(organization.id)}/invitations`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
    if(!invitations.ok)throw new Error('Could not load pending invitations.')
    const pending=await invitations.json() as {invitations:{id:string;email:string;status:string;email_status:string;intent?:{scheme:PersonnelScheme;classes:string[];roleNames?:Record<string,string>}|null;purpose:string}[]}
    for(const invitation of pending.invitations.filter(item=>item.status==='pending'))people.push({
     id:`invitation:${invitation.id}`,name:invitation.email,titles:invitation.intent?invitation.intent.classes.map(key=>invitation.intent!.roleNames?.[key]||(personnelSchemes[invitation.intent!.scheme].classes as Record<string,{label:string}>)[key]?.label||key):[invitation.purpose==='member'?'Member':'Volunteer'],
     photo_url:null,profile_slug:null,personnel_class:'public',pendingInvitation:true,deliveryStatus:invitation.email_status,
    })
   }
   if(!controller.signal.aborted){setPeople(people);setLoading(false)}
  }).catch(reason=>{if(!controller.signal.aborted){setError(reason.message);setLoading(false)}})
  return()=>controller.abort()
 },[organization.id,organization.slug,revision,label,canManage,token])
 return <section className="organization-board" aria-label={`${organization.name} ${label.toLowerCase()}`}>
  <header><p className="tenant-home-eyebrow">People and roles</p><Heading>{embedded?'People':organization.name+' '+label}</Heading><p>The people behind the organization: board members, officers, specialists, advisors, and community members.</p></header>
  {schemeError&&<p role="alert">{schemeError} <button type="button" className="btn-secondary" onClick={()=>window.dispatchEvent(new Event('organization-personnel-scheme-updated'))}>Retry settings</button></p>}
  {!scheme&&!schemeError&&<p className="muted">Loading personnel settings…</p>}
  {canManage&&scheme&&<PersonnelInvitations organizationId={organization.id} scheme={scheme} />}
  {loading&&<p role="status">Loading {label.toLowerCase()}…</p>}
  {error&&<p role="alert">{error} <button className="btn-secondary" onClick={()=>setRevision(value=>value+1)}>Retry {label.toLowerCase()}</button></p>}
  {!loading&&!error&&!people.length&&<p>No personnel have been published yet.</p>}
  <div className="organization-board-grid">{people.map(person=><article className={`portal-card organization-board-person${person.pendingInvitation?' organization-board-person-pending':''}`} data-invitation-status={person.pendingInvitation?'pending':undefined} key={person.id}>
   <OrganizationAvatar name={person.name} src={person.photo_url} status={person.pendingInvitation||!scheme?null:person.personnel_class} scheme={scheme||'meetup'} titles={person.titles} classKeys={person.role_classes?.filter(role=>role.scheme===scheme).map(role=>role.key)} />
   <h2>{person.profile_slug?<Link to={`/users/${encodeURIComponent(person.profile_slug)}`}>{person.name}</Link>:person.name}</h2><div className="organization-member-titles">{person.titles.map(title=><span className="pill" key={title}>{title}</span>)}</div>
   {person.pendingInvitation&&<><strong className="organization-invitation-pending-label">Pending invitation</strong><p>{person.deliveryStatus==='sent'?'Invitation sent. Awaiting acceptance.':person.deliveryStatus==='queued'?'Invitation queued. Awaiting delivery.':person.deliveryStatus==='failed'?'Email could not be sent. See invitation details.':'Awaiting acceptance. See invitation details.'}</p></>}
   {person.description&&<p className="organization-board-description">{person.description}</p>}
   {person.photo_source_url&&<a className="organization-portrait-source" href={person.photo_source_url} target="_blank" rel="noopener noreferrer">Photo source</a>}
  </article>)}</div>
  {scheme&&(canRead||canManage)&&<OrganizationMembers organizationId={organization.id} name={organization.name} canRead={canRead||canManage} canManage={canManage} membershipCount={organization.membership_count||0} memberType={memberType} scheme={scheme} />}
  {scheme&&<details className="personnel-settings"><summary>Personnel settings · {personnelSchemes[scheme].label}</summary>
   {canManage&&<OrganizationPersonnelScheme organizationId={organization.id} canManage scheme={scheme} />}
   <OrganizationPersonnelLegend scheme={scheme} />
  </details>}
 </section>
}
