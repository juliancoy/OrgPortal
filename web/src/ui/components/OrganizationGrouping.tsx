import {createContext,useContext,useEffect,useState,type ReactNode} from 'react'
import {Link,useLocation,useNavigate} from 'react-router-dom'
import {useAuth} from '../../app/AppProviders'
import {useEcosystemQuery,type QueryMeta} from '../../features/ecosystem/ecosystemApi'
import type {EvidenceGrouping} from '../../../../shared/organizationEvidenceGroups'
import './organization-grouping.css'
type Node={id:string;name:string;slug?:string|null;recordCount?:number}
type GroupContext={reference:string;group:EvidenceGrouping|null;ready:boolean;error:string;changed:(group:EvidenceGrouping)=>void}
const Context=createContext<GroupContext>({reference:'',group:null,ready:true,error:'',changed:()=>{}})
export function useOrganizationGrouping(){return useContext(Context)}
export function useGroupingMembers(handle:string){
 const {group}=useOrganizationGrouping()
 return group&&(handle===group.organizationId||handle===group.slug)&&group.members.length?JSON.stringify(group.members):undefined
}
export function OrganizationGroupingProvider({reference,children}:{reference:string;children:ReactNode}){
 const [state,setState]=useState<{reference:string;group:EvidenceGrouping|null;error:string}|null>(null)
 const navigate=useNavigate(),location=useLocation()
 useEffect(()=>{
  const abort=new AbortController()
  void fetch(`/api/org/api/network/evidence-groups/public?${new URLSearchParams({org:reference})}`,{signal:abort.signal,cache:'no-store'}).then(async response=>{
   if(!response.ok)throw Error('Grouping is unavailable. Showing this source separately.')
   const data=await response.json() as {group:EvidenceGrouping|null}
   if(!abort.signal.aborted)setState({reference,group:data.group,error:''})
  }).catch(error=>{if(!abort.signal.aborted)setState({reference,group:null,error:error.message})})
  return()=>abort.abort()
 },[reference])
 const current=state?.reference===reference?state:null
 useEffect(()=>{
  const group=current?.group
  if(group&&reference!==group.slug&&reference!==group.organizationId&&group.members.includes(reference))navigate(`/orgs/${encodeURIComponent(group.slug)}${location.search}`,{replace:true,state:location.state})
 },[current,navigate,reference,location.state,location.search])
 return <Context.Provider value={{reference,group:current?.group||null,ready:!!current,error:current?.error||'',changed:group=>setState({reference,group,error:''})}}>{children}</Context.Provider>
}
export function OrganizationGrouping(){
 const {group,ready,error,changed}=useOrganizationGrouping()
 if(error)return <p role="status">{error}</p>
 if(!ready||!group)return null
 return <GroupingEditor key={group.organizationId} group={group} changed={changed}/>
}
function GroupingEditor({group,changed}:{group:EvidenceGrouping;changed:(value:EvidenceGrouping)=>void}){
 const {token}=useAuth(),[access,setAccess]=useState(false),[accessMessage,setAccessMessage]=useState(''),[query,setQuery]=useState(''),[offset,setOffset]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState<{action:'add'|'remove';member:Node}|null>(null)
 const members=JSON.stringify(group.members)
 const {data,error}=useEcosystemQuery<QueryMeta&{members:Node[];missingMembers:string[]}>('organization-group',{org:group.slug,members})
 const search=useEcosystemQuery<QueryMeta&{records:Node[];nextOffset:number|null}>('organizations',{q:(query||group.name).slice(0,128),limit:10,offset})
 useEffect(()=>{
  setAccess(false);setAccessMessage('')
  if(!token)return
  const abort=new AbortController()
  void fetch(`/api/org/api/network/orgs/${encodeURIComponent(group.organizationId)}/evidence-group/access`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:abort.signal}).then(async response=>{
   if(response.status===403)return {canManage:false}
   if(!response.ok)throw Error('Could not check grouping permissions.')
   return response.json()
  }).then(value=>{if(!abort.signal.aborted){setAccess(value.canManage===true);setAccessMessage(value.reason||'')}}).catch(error=>{if(!abort.signal.aborted)setAccessMessage(error.message)})
  return()=>abort.abort()
 },[token,group.organizationId])
 async function change(action:'add'|'remove',member:Node){
  setBusy(true);setFailed(null);setMessage('Saving grouping…')
  try{
   const response=await fetch(`/api/org/api/network/orgs/${encodeURIComponent(group.organizationId)}/evidence-group`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action,member:{id:member.id,name:member.name}})})
   const value=await response.json();if(!response.ok)throw Error(value.error||value.detail||'Could not save grouping')
   changed(value.group);setMessage('Grouping saved.')
  }catch(error){setFailed({action,member});setMessage(error instanceof Error?error.message:'Could not save grouping')}finally{setBusy(false)}
 }
 const center=data?.members[0]?.id||group.organizationId,memberSet=new Set([center,group.organizationId,...group.members])
 return <details className="organization-grouping"><summary>Grouping · {group.members.length+1} source {group.members.length?'nodes':'node'}</summary>
  <p>These source nodes are displayed together on {group.name}’s page. Original records, labels and organizations remain intact.</p>
  {error&&<p role="alert">{error}</p>}
  <ul>{(data?.members||[{id:group.organizationId,name:group.name}]).map(member=><li key={member.id}><div><strong>{member.name}</strong>{member.recordCount!==undefined&&<span> · {member.recordCount.toLocaleString()} records</span>}<small>{member.id}</small></div>{member.id===center?<span>Center</span>:access&&<button disabled={busy} onClick={()=>void change('remove',member)} aria-label={`Remove ${member.name} from grouping`}>Remove</button>}</li>)}
   {data?.missingMembers.map(id=><li key={id}><div>Source no longer in this snapshot<small>{id}</small></div>{access&&<button disabled={busy} onClick={()=>void change('remove',{id,name:id})}>Remove</button>}</li>)}
  </ul>
  {access?<><label>Find a source node<input value={query} onChange={event=>{setQuery(event.target.value);setOffset(0)}} placeholder="Search source names"/></label>
   {search.error&&<p role="alert">{search.error}</p>}
   <ul>{search.data?.records.filter(member=>!memberSet.has(member.id)).map(member=><li key={member.id}><div>{member.name}<small>{member.id}</small></div><button disabled={busy} onClick={()=>void change('add',member)} aria-label={`Add ${member.name} to grouping`}>Add</button></li>)}</ul>
   <div className="organization-evidence-actions"><button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-10))}>Previous matches</button><button disabled={search.data?.nextOffset==null} onClick={()=>setOffset(search.data!.nextOffset!)}>Next matches</button></div>
  </>:<p>{accessMessage||'Organization owners, administrators and authorized operators can add or remove source nodes.'}{!token&&<> <Link to="/login">Sign in to edit</Link></>}</p>}
  {message&&<p role={failed?'alert':'status'}>{message} {failed&&<button disabled={busy} onClick={()=>void change(failed.action,failed.member)}>Retry</button>}</p>}
 </details>
}
