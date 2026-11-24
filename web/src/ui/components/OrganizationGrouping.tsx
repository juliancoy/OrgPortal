import {createContext,useContext,useEffect,useState,type ReactNode} from 'react'
import {Link,useLocation,useNavigate} from 'react-router-dom'
import {useAuth} from '../../app/AppProviders'
import {useEcosystemQuery,type QueryMeta} from '../../features/ecosystem/ecosystemApi'
import type {EvidenceGrouping} from '../../../../shared/organizationEvidenceGroups'
import {matchOrganizationNames,type OrganizationMatch} from '../../../../shared/organizationMatching'
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
 const search=useEcosystemQuery<QueryMeta&{records:Node[];nextOffset:number|null;truncated?:boolean}>('organizations',{q:(query||group.name).slice(0,128),match:'fuzzy',limit:10,offset})
 const [history,setHistory]=useState<{id:string;at:string;action:string;memberId:string;memberName:string|null;method:string;reason:string|null;match:OrganizationMatch|null;source:{datasetId?:string;sha256?:string;id?:string}|null}[]>([]),[historyError,setHistoryError]=useState(''),[historyOffset,setHistoryOffset]=useState(0),[historyNext,setHistoryNext]=useState<number|null>(null),[historyRevision,setHistoryRevision]=useState(0)
 useEffect(()=>{
  const abort=new AbortController();setHistoryError('')
  void fetch(`/api/org/api/network/orgs/${encodeURIComponent(group.organizationId)}/evidence-group/history?offset=${historyOffset}`,{signal:abort.signal,cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('Association history is unavailable.');return response.json()}).then(value=>{if(!abort.signal.aborted){setHistory(value.records);setHistoryNext(value.nextOffset)}}).catch(error=>{if(!abort.signal.aborted)setHistoryError(error.message)})
  return()=>abort.abort()
 },[group.organizationId,members,historyOffset,historyRevision])
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
   changed(value.group);setHistoryOffset(0);setHistoryRevision(n=>n+1);setMessage(action==='remove'?'Association removed. Automatic matching will not restore it.':'Association saved.')
  }catch(error){setFailed({action,member});setMessage(error instanceof Error?error.message:'Could not save grouping')}finally{setBusy(false)}
 }
 const center=data?.members[0]?.id||group.organizationId,memberSet=new Set([center,group.organizationId,...group.members])
 const candidates=(search.data?.records||[]).filter(member=>!memberSet.has(member.id)).map(member=>({...member,match:matchOrganizationNames(group.name,member.name)}))
 async function associate(){
  setBusy(true);setFailed(null);setMessage('Recording automatic associations…');let added=0;const skipped:string[]=[]
  try{
   for(const member of candidates.filter(n=>n.match.automatic)){
    const response=await fetch(`/api/org/api/network/orgs/${encodeURIComponent(group.organizationId)}/evidence-group`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'add',mode:'automatic',member:{id:member.id,name:member.name}})})
    const value=await response.json()
    if(response.status===409||response.status===400){skipped.push(`${member.name}: ${value.error||value.detail||'Needs review'}`);continue}
    if(!response.ok)throw Error(value.error||value.detail||'Association run interrupted; reload before continuing.')
    changed(value.group);added++
   }
   setHistoryOffset(0);setHistoryRevision(n=>n+1);setMessage(`${added} associations recorded.${skipped.length?' '+skipped.join(' · '):''}`)
  }catch(error){setMessage(`${added} associations recorded before the run stopped. ${error instanceof Error?error.message:'Reload to check the result.'}`)}finally{setBusy(false)}
 }
 return <details className="organization-grouping"><summary>Grouping · {group.members.length+1} source {group.members.length?'nodes':'node'}</summary>
  <p>These source nodes are displayed together on {group.name}’s page. Original records, labels and organizations remain intact.</p>
  {error&&<p role="alert">{error}</p>}
  <ul>{(data?.members||[{id:group.organizationId,name:group.name}]).map(member=><li key={member.id}><div><strong>{member.name}</strong>{member.recordCount!==undefined&&<span> · {member.recordCount.toLocaleString()} records</span>}<small>{member.id}</small></div>{member.id===center?<span>Center</span>:access&&<button disabled={busy} onClick={()=>void change('remove',member)} aria-label={`Remove ${member.name} from grouping`}>Remove</button>}</li>)}
   {data?.missingMembers.map(id=><li key={id}><div>Source no longer in this snapshot<small>{id}</small></div>{access&&<button disabled={busy} onClick={()=>void change('remove',{id,name:id})}>Remove</button>}</li>)}
  </ul>
  {access?<><label>Find a source node<input value={query} onChange={event=>{setQuery(event.target.value);setOffset(0)}} placeholder="Search source names"/></label>
   <p>Matching scores compare names with {group.name}; they are not probabilities. Automatic associations become active shared records. Removing one blocks future automatic reassociation.</p>
   <button disabled={busy||!candidates.some(n=>n.match.automatic)} onClick={()=>void associate()}>Associate eligible matches on this page</button>
   {search.data?.truncated&&<p role="status">This name has more than 500 candidates. Refine the search to review the remaining sources.</p>}
   {search.error&&<p role="alert">{search.error}</p>}
   <ul>{candidates.map(member=><li key={member.id}><div>{member.name}<small>{member.id}</small><small>Score {member.match.score}/100 · {member.match.automatic?'Eligible for automatic association':'Human review required'}</small><small>{[...member.match.reasons,...member.match.conflicts].join(' · ')}</small></div><button disabled={busy} onClick={()=>void change('add',member)} aria-label={`Add ${member.name} to grouping`}>Add</button></li>)}</ul>
   <div className="organization-evidence-actions"><button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-10))}>Previous matches</button><button disabled={search.data?.nextOffset==null} onClick={()=>setOffset(search.data!.nextOffset!)}>Next matches</button></div>
  </>:<p>{accessMessage||'Organization owners, administrators and authorized operators can add or remove source nodes.'}{!token&&<> <Link to="/login">Sign in to edit</Link></>}</p>}
  {message&&<p role={failed?'alert':'status'}>{message} {failed&&<button disabled={busy} onClick={()=>void change(failed.action,failed.member)}>Retry</button>}</p>}
  <details><summary>Association history</summary>
   {historyError?<p role="alert">{historyError} <button onClick={()=>setHistoryRevision(n=>n+1)}>Retry history</button></p>:<>
    {!history.length&&<p>No recorded association changes are available on this server.</p>}
    <ul>{history.map(entry=><li key={entry.id}><div><strong>{entry.action==='remove'?'Removed':'Associated'}: {entry.memberName||entry.memberId}</strong><small>{entry.at} · {entry.method}</small><small>{entry.memberId}</small><span>{entry.reason}</span>{entry.match&&<><small>{entry.match.version} · score {entry.match.score}/100</small><small>{entry.match.left} ↔ {entry.match.right}</small><small>{entry.match.reasons.join(' · ')}</small></>}{entry.source?.datasetId&&<small>Source snapshot {entry.source.datasetId} · SHA256 {entry.source.sha256}</small>}</div></li>)}</ul>
    <button disabled={!historyOffset} onClick={()=>setHistoryOffset(n=>Math.max(0,n-50))}>Newer changes</button> <button disabled={historyNext===null} onClick={()=>setHistoryOffset(historyNext!)}>Older changes</button>
   </>}
  </details>
 </details>
}
