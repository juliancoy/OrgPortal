import { usePersonnelScheme } from './OrganizationPersonnelScheme'
import type {PersonnelClass} from '../../../../shared/organizationPersonnel'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { OrganizationAvatar, OrganizationPersonnelLegend } from './OrganizationAvatar'
import { OrganizationMembers } from './OrganizationMembers'
import './OrganizationBoard.css'

type Person={id:string;name:string;titles:string[];description?:string|null;photo_url:string|null;photo_source_url?:string|null;profile_slug:string|null;personnel_class:PersonnelClass}
export function OrganizationBoard({organization,canManage,view='board'}:{organization:{id:string;slug:string;name:string;membership_count?:number};canManage:boolean;view?:'board'|'personnel'}){
 const scheme=usePersonnelScheme(organization.id)
 const label=view==='personnel'?'Personnel':'Board'
 const [people,setPeople]=useState<Person[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{
  const refresh=(event:Event)=>{if((event as CustomEvent).detail?.organizationId===organization.id)setRevision(value=>value+1)}
  window.addEventListener('organization-member-titles-updated',refresh)
  return()=>window.removeEventListener('organization-member-titles-updated',refresh)
 },[organization.id])
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setPeople([]);setError('')
  void fetch(`/api/org/api/network/orgs/public/${encodeURIComponent(organization.slug)}/${view}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   if(!response.ok)throw new Error(`Could not load organization ${label.toLowerCase()}.`)
   const data=await response.json();if(!controller.signal.aborted){setPeople(data.people);setLoading(false)}
  }).catch(reason=>{if(!controller.signal.aborted){setError(reason.message);setLoading(false)}})
  return()=>controller.abort()
 },[organization.slug,revision,view,label])
 return <section className="organization-board" aria-label={`${organization.name} ${label.toLowerCase()}`}>
  <header><p className="tenant-home-eyebrow">People and roles</p><h1>{organization.name} {label}</h1><p>{view==='personnel'?'The people behind the organization: officers, specialists, advisors, and community members.':'Leadership, specialists, and advisors.'}</p></header>
  <OrganizationPersonnelLegend scheme={scheme} />
  {loading&&<p role="status">Loading {label.toLowerCase()}…</p>}
  {error&&<p role="alert">{error} <button className="btn-secondary" onClick={()=>setRevision(value=>value+1)}>Retry {label.toLowerCase()}</button></p>}
  {!loading&&!error&&!people.length&&<p>{view==='personnel'?'No personnel have been published yet.':'No board roles have been assigned yet.'}</p>}
  <div className="organization-board-grid">{people.map(person=><article className="portal-card organization-board-person" key={person.id}>
   <OrganizationAvatar name={person.name} src={person.photo_url} status={person.personnel_class} scheme={scheme} titles={person.titles} />
   <h2>{person.profile_slug?<Link to={`/users/${encodeURIComponent(person.profile_slug)}`}>{person.name}</Link>:person.name}</h2><div className="organization-member-titles">{person.titles.map(title=><span className="pill" key={title}>{title}</span>)}</div>
   {person.description&&<p className="organization-board-description">{person.description}</p>}
   {person.photo_source_url&&<a className="organization-portrait-source" href={person.photo_source_url} target="_blank" rel="noopener noreferrer">Photo source</a>}
  </article>)}</div>
  {canManage&&<OrganizationMembers organizationId={organization.id} name={organization.name} canRead canManage membershipCount={organization.membership_count||0} />}
 </section>
}
