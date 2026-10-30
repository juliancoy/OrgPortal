import {useEffect,useId,useState} from 'react'
import Plus from 'lucide-react/dist/esm/icons/plus.mjs'
import Minus from 'lucide-react/dist/esm/icons/minus.mjs'
import Trophy from 'lucide-react/dist/esm/icons/trophy.mjs'
import {loadPublicOrganization} from '../../data/publicOrganization/organizations'
import {BioMarkdown} from './profile/BioMarkdown'
import {CmsImage} from './media/CmsImage'

type Prize={id:string;title:string;url:string;description?:string|null;image_url?:string|null}
type Company={id:string;slug:string;name:string;description?:string|null}
export function EventPrize({prize}:{prize:Prize}){
 const [expanded,setExpanded]=useState(false),[company,setCompany]=useState<Company|null>(null)
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 // Prize link IDs carry the canonical organization slug after the prefix.
 const panelId=useId(),slug=/^winner-prize-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(prize.id)?.[1]
 useEffect(()=>{
  if(!expanded||company)return
  if(!slug){setError('Company details are unavailable.');return}
  const controller=new AbortController();setLoading(true);setError('')
  void loadPublicOrganization<Company>(slug,{signal:controller.signal}).then(data=>{
   if(!controller.signal.aborted){setCompany(data);setLoading(false)}
  }).catch(()=>{if(!controller.signal.aborted){setError('Could not load the company description.');setLoading(false)}})
  return()=>controller.abort()
 },[expanded,company,slug,revision])
 return <section className="public-event-prize" aria-label={`Winner’s prize: ${prize.title}`}>
  <div className="public-event-prize-header">
   <a className="public-event-prize-link" href={prize.url} aria-label={`Winner’s prize: ${prize.title}`}>
    <Trophy size={22} aria-hidden="true"/>
    <span className="public-event-prize-copy"><strong>Winner’s prize</strong>{prize.description&&<span>{prize.description}</span>}</span>
    {prize.image_url?<span className="public-event-prize-logo"><CmsImage src={prize.image_url} alt={prize.title}/></span>:<span>{prize.title}</span>}
   </a>
   <button type="button" className="public-event-prize-expand" aria-label={`${expanded?'Collapse':'Expand'} ${prize.title} description`} aria-expanded={expanded} aria-controls={panelId} onClick={()=>setExpanded(value=>!value)}>
    {expanded?<Minus size={20} aria-hidden="true"/>:<Plus size={20} aria-hidden="true"/>}
   </button>
  </div>
  <div className="public-event-prize-details" id={panelId} hidden={!expanded}>
   {loading&&<p role="status">Loading company description…</p>}
   {error&&<p role="alert">{error} <button type="button" className="btn-secondary" onClick={()=>setRevision(value=>value+1)}>Retry</button></p>}
   {company&&<><h3>About {company.name}</h3>{company.description?<BioMarkdown value={company.description}/>:<p>No company description has been added yet.</p>}</>}
  </div>
 </section>
}
