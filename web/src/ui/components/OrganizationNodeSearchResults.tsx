import {useEffect,useRef,useState} from 'react'
import {ecosystemUrl} from '../../features/ecosystem/ecosystemApi'
import {readEvidenceResponse} from '../../features/ecosystem/readEvidenceResponse.js'
import type {MapNode} from '../../features/ecosystem/organizationMap'
import {nodeSearchSource,type NodeSearchGroup,type NodeSearchRecord} from '../../features/ecosystem/node-search-groups.js'

type SearchPage={version:string;groupedBy:'name';records:NodeSearchGroup[];total:number;nodeTotal:number;offset:number;nextOffset:number|null}
const pageSize=20

// The parent keys this component by query, resetting pagination and snapshot
// when the query changes. Search is independent of map depth and fiscal year.
export function OrganizationNodeSearchResults({query,ready,onSelect}:{query:string;ready:boolean;onSelect:(node:MapNode)=>void}){
 const [offset,setOffset]=useState(0),[result,setResult]=useState<SearchPage|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0)
 const version=useRef<string|undefined>(undefined)
 useEffect(()=>{
  const abort=new AbortController();setError('');setResult(null)
  const timer=setTimeout(()=>{
   void fetch(ecosystemUrl('organizations',{q:query,group:'name',offset,limit:pageSize,version:version.current}),{signal:abort.signal,credentials:'omit'})
    .then(response=>readEvidenceResponse<SearchPage>(response,'Node search'))
    .then(page=>{
     const validNode=(node:NodeSearchRecord)=>node&&typeof node.id==='string'&&typeof node.name==='string'
     if(page.groupedBy!=='name'||!Number.isSafeInteger(page.nodeTotal)||page.nodeTotal<page.total||!Array.isArray(page.records)||page.records.some(node=>!validNode(node)||!Array.isArray(node.members)||!node.members.length||node.members.some(member=>!validNode(member)))||typeof page.version!=='string'||!Number.isSafeInteger(page.total)||page.total<0||page.offset!==offset||(page.nextOffset!==null&&(!Number.isSafeInteger(page.nextOffset)||page.nextOffset<=offset)))throw Error('Node search returned an incomplete result. Please retry.')
     if(!abort.signal.aborted){version.current=page.version;setResult(page)}
    }).catch(reason=>{if(!abort.signal.aborted)setError(reason instanceof Error?reason.message:'Node search failed. Please retry.')})
  },180)
  return()=>{clearTimeout(timer);abort.abort()}
 },[query,offset,attempt])
 const page=result?.offset===offset?result:null
 return <div className="organization-ecomap-search" aria-label="All node search results">
  {error?<p role="alert">{error} <button type="button" onClick={()=>{version.current=undefined;setOffset(0);setAttempt(value=>value+1)}}>Retry node search</button></p>:!page?<p role="status">Searching all nodes…</p>:<>
   <p role="status">{page.total?`${page.total.toLocaleString()} matching names · ${offset+1}–${offset+page.records.length} · ${page.nodeTotal.toLocaleString()} source nodes`:'No matching nodes in the full directory.'}</p>
   {page.nodeTotal>page.total&&<p className="muted">Matching names are grouped. Expand to choose a source; their records remain separate.</p>}
   {page.records.map(group=>group.members.length===1?<button type="button" disabled={!ready} key={group.id} title={`${group.name} · ${nodeSearchSource(group.members[0])}`} aria-label={group.name} onClick={()=>onSelect({...group.members[0],category:'general',slug:null})}>{group.name}</button>:<details className="organization-ecomap-search-group" key={group.id}>
    <summary>{group.name} <span>· {group.members.length} sources</span></summary>
    <div>{group.members.map(node=><button type="button" disabled={!ready} key={node.id} title={node.id} aria-label={`${node.name} · ${nodeSearchSource(node)} · ${node.id}`} onClick={()=>onSelect({...node,category:'general',slug:null})}><span>{nodeSearchSource(node)}</span><small>{node.id}</small></button>)}</div>
   </details>)}
   {(offset>0||page.nextOffset!==null)&&<nav className="organization-ecomap-search-pages" aria-label="Node search pages"><button type="button" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-pageSize))}>Previous results</button><button type="button" disabled={page.nextOffset===null} onClick={()=>setOffset(page.nextOffset!)}>Next results</button></nav>}
  </>}
 </div>
}
