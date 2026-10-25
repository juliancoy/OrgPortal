import {useEffect,useRef,useState} from 'react'
import {Link,useLocation} from 'react-router-dom'
import Star from 'lucide-react/dist/esm/icons/star.mjs'
import {useAuth} from '../../app/AppProviders'
import {invalidatePublicOrganizationData} from '../../data/publicOrganization/cache'
import {FavoriteQuota,type FavoriteChoice} from './FavoriteQuota'
export function OrganizationCandidateStar({eventId,submissionId,title,stars}:{eventId:string;submissionId:string;title:string;stars:number}){
 const {token}=useAuth(),location=useLocation(),button=useRef<HTMLButtonElement>(null)
 const [ballot,setBallot]=useState<{ids:string[];limit:number;token:string}|null>(null),[count,setCount]=useState(stars),[busy,setBusy]=useState(false),[quota,setQuota]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[revision,setRevision]=useState(0)
 const epoch=useRef(0),base=`/api/org/api/network/events/${encodeURIComponent(eventId)}/presentations`
 useEffect(()=>setCount(stars),[stars])
 useEffect(()=>{const controller=new AbortController();epoch.current++;setBallot(null);setBusy(false);setQuota(false);setError('');setMessage('')
  if(token)void fetch(base+'/favorites',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw Error('Could not load your stars.');const data=await response.json();if(!controller.signal.aborted)setBallot({ids:data.favorites,limit:data.limit,token})}).catch(reason=>{if(!controller.signal.aborted)setError(reason.message)})
  return()=>{controller.abort();epoch.current++}
 },[base,token,revision])
 const ready=Boolean(token&&ballot?.token===token),selected=ready&&ballot!.ids.includes(submissionId)
 async function save(id:string,value:boolean){
  const current=epoch.current;setBusy(true);setError('');setMessage('')
  const change=id===submissionId?(value?1:-1):0;setCount(previous=>Math.max(0,previous+change))
  try{const response=await fetch(base+'/favorites/'+encodeURIComponent(id),{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({selected:value})});const data=await response.json();if(!response.ok)throw Error(data.message||'Could not save your star.')
   if(current===epoch.current){setBallot(previous=>previous?{...previous,ids:value?[...new Set([...previous.ids,id])]:previous.ids.filter(item=>item!==id)}:null);setMessage(value?'Star added.':'Star removed. You can star another submission.')}await invalidatePublicOrganizationData()
  }catch(reason){if(current===epoch.current){setCount(previous=>Math.max(0,previous-change));setError(reason instanceof Error?reason.message:'Could not save your star.')}throw reason
  }finally{if(current===epoch.current)setBusy(false)}
 }
 const close=()=>{setQuota(false);button.current?.focus()}
 return <div className="organization-candidate-vote">
  {token?<button ref={button} type="button" className="organization-candidate-stars" aria-pressed={Boolean(selected)} aria-label={`${selected?'Remove star from':'Star'} ${title}; ${count} ${count===1?'star':'stars'}`} disabled={!ready||busy} onClick={async()=>{if(!ballot)return;const current=epoch.current;if(!selected&&ballot.ids.length>=ballot.limit){setQuota(true);return}try{await save(submissionId,!selected)}catch{if(current!==epoch.current)return;try{const response=await fetch(base+'/favorites',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});if(response.ok){const data=await response.json();if(current!==epoch.current)return;setBallot({ids:data.favorites,limit:data.limit,token});if(data.favorites.length>=data.limit&&!data.favorites.includes(submissionId))setQuota(true)}}catch{/* Keep the save error visible. */}}}}><Star size={17} fill={selected?'currentColor':'none'} aria-hidden="true"/><span>{count.toLocaleString()}</span></button>:<Link className="organization-candidate-stars" to={`/users/login?next=${encodeURIComponent(location.pathname+location.search)}`} aria-label={`Sign in to star ${title}; ${count} stars`}><Star size={17} aria-hidden="true"/><span>{count.toLocaleString()}</span></Link>}
  {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error} {!ready&&<button type="button" onClick={()=>setRevision(value=>value+1)}>Retry stars</button>}</p>}
  {quota&&ready&&<FavoriteQuota eventId={eventId} ids={ballot!.ids} limit={ballot!.limit} token={token!} onClose={close} onRemove={(choice:FavoriteChoice)=>save(choice.submission_id,false)}/>}
 </div>
}
