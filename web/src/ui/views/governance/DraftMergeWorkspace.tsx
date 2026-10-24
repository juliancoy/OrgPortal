import { useEffect, useRef, useState } from 'react'
import { Link, useBlocker } from 'react-router-dom'
import type { Section } from './GovernanceDocumentPage'
import { acceptBlock, compareParagraphs } from './draftComparison'
import './draft-merge-workspace.css'

type Source = {source:string;revision:string;sectionId:string;element:string}
type Entry = {id:string;owner_id:string;owner_name:string;name:string;head:number;updated_at:string}
type Snapshot = {draft:Entry;revision:number;base_version:number;baseSections:Section[];sections:Section[];sources:Source[]}
type Revision = {revision:number;parent_revision:number;content_hash:string;message:string;created_at:string}
type Candidate = {version:number;sections:Section[];gptSuggestions:{sectionId:string;replacement:string;decision:string}[]}
type Props = {doc:Candidate;userId?:string;canEdit:boolean;canPropose:boolean;request:(suffix:string,init?:RequestInit)=>Promise<any>;onPropose:(section:Section)=>void}
type Comparison = {label:string;sections:Section[];source:string;revision:string}

function DraftPicker({label,value,onChange,entries,onMore,hasMore,baseLabel,selectedLabel}:{label:string;value:string;onChange:(id:string)=>void;entries:Entry[];onMore:()=>void;hasMore:boolean;baseLabel:string;selectedLabel?:string}) {
 return <div className="merge-picker"><label>{label}</label><select aria-label={`${label} draft`} value={value} onChange={e=>onChange(e.target.value)}><option value="canonical">Current organization text</option><option value="base">{baseLabel}</option><option value="gpt">GPT recommendations</option>{!['canonical','base','gpt'].includes(value)&&!entries.some(entry=>entry.id===value)&&<option value={value}>{selectedLabel||'Selected draft'}</option>}{entries.map(entry=><option key={entry.id} value={entry.id}>{entry.owner_name} · {entry.name} · r{entry.head}</option>)}</select>{hasMore&&<button type="button" onClick={onMore}>More drafts</button>}</div>
}

export function DraftMergeWorkspace({doc,userId,canEdit,canPropose,request,onPropose}:Props) {
 const [sections,setSections]=useState<Section[]>(()=>doc.sections.map(section=>({...section})))
 const [base,setBase]=useState({version:doc.version,sections:doc.sections})
 const [draftId,setDraftId]=useState<string>(()=>crypto.randomUUID()),[head,setHead]=useState(0),[name,setName]=useState('My constitution draft')
 const [saved,setSaved]=useState(JSON.stringify({sections:doc.sections,name:'My constitution draft',baseVersion:doc.version})),[message,setMessage]=useState('')
 const [sources,setSources]=useState<Source[]>([]),[three,setThree]=useState(true),[left,setLeft]=useState('gpt'),[right,setRight]=useState('base')
 const [leftSnapshot,setLeftSnapshot]=useState<Snapshot|null>(null),[rightSnapshot,setRightSnapshot]=useState<Snapshot|null>(null)
 const [entries,setEntries]=useState<Entry[]>([]),[search,setSearch]=useState(''),[directoryRefresh,setDirectoryRefresh]=useState(0),[nextOffset,setNextOffset]=useState<number|null>(null)
 const [historyDraft,setHistoryDraft]=useState(''),[historySide,setHistorySide]=useState<'mine'|'left'|'right'>('mine')
 const [history,setHistory]=useState<Revision[]>([]),[nextBefore,setNextBefore]=useState<number|null>(null),[historyOpen,setHistoryOpen]=useState(false)
 const [error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[filter,setFilter]=useState(''),[changesOnly,setChangesOnly]=useState(false)
 const [preview,setPreview]=useState<{previewId:string;payload:Record<string,unknown>}|null>(null)
 const [undo,setUndo]=useState<Section[][]>([]),[redo,setRedo]=useState<Section[][]>([])
 const requestRef=useRef(request);requestRef.current=request
 const queryGeneration=useRef(0)
 const dirty=JSON.stringify({sections,name,baseVersion:base.version})!==saved
 const blocker=useBlocker(({currentLocation,nextLocation})=>dirty&&(currentLocation.pathname!==nextLocation.pathname))
 const dirtyRef=useRef(dirty);dirtyRef.current=dirty
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirtyRef.current){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[])
 useEffect(()=>{
  if(!canEdit)return
  const generation=++queryGeneration.current
  const timer=setTimeout(()=>{void requestRef.current('/drafts?search='+encodeURIComponent(search)).then(result=>{if(generation===queryGeneration.current){setEntries(result.drafts);setNextOffset(result.nextOffset)}}).catch(e=>{if(generation===queryGeneration.current)setError(e.message)})},250)
  return()=>clearTimeout(timer)
 },[search,canEdit,directoryRefresh])
 useEffect(()=>{
  let cancelled=false
  async function load(id:string,set:(snapshot:Snapshot|null)=>void){
   if(['canonical','base','gpt'].includes(id)){set(null);return}
   try{const snapshot=await requestRef.current('/drafts/'+encodeURIComponent(id));if(!cancelled)set(snapshot)}catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Unable to load draft')}
  }
  setLeftSnapshot(null);setRightSnapshot(null)
  void load(left,setLeftSnapshot);if(three)void load(right,setRightSnapshot)
  return()=>{cancelled=true}
 },[left,right,three])
 function edit(next:Section[]){setUndo(stack=>[...stack.slice(-49),sections]);setRedo([]);setSections(next);setPreview(null);setStatus('Unsaved changes')}
 function update(id:string,text:string){edit(sections.map(section=>section.id===id?{...section,text}:section))}
 function comparison(id:string,snapshot:Snapshot|null):Comparison|null {
  if(id==='canonical')return {label:`Organization · revision ${doc.version}`,sections:doc.sections,source:'canonical',revision:String(doc.version)}
  if(id==='base')return {label:`Common base · revision ${base.version}`,sections:base.sections,source:'canonical',revision:String(base.version)}
  if(id==='gpt')return {label:'GPT recommendations',sections:doc.sections.map(section=>({...section,text:doc.gptSuggestions.find(s=>s.sectionId===section.id)?.replacement??section.text})),source:'gpt',revision:'prepared'}
  return snapshot?{label:`${snapshot.draft.owner_name||'Member'} · ${snapshot.draft.name} · r${snapshot.revision}`,sections:snapshot.sections,source:snapshot.draft.id,revision:String(snapshot.revision)}:null
 }
 const comparisons=[comparison(left,leftSnapshot),...(three?[comparison(right,rightSnapshot)]:[])]
 async function moreDrafts(){const generation=queryGeneration.current;try{const result=await requestRef.current('/drafts?search='+encodeURIComponent(search)+'&offset='+nextOffset);if(generation!==queryGeneration.current)return;setEntries(previous=>[...previous,...result.drafts.filter((entry:Entry)=>!previous.some(old=>old.id===entry.id))]);setNextOffset(result.nextOffset)}catch(e){setError(e instanceof Error?e.message:'Unable to load drafts')}}
 async function loadHistory(before?:number,id=draftId,side:'mine'|'left'|'right'='mine'){try{const result=await requestRef.current(`/drafts/${id}/history${before?'?before='+before:''}`);setHistory(previous=>before?[...previous,...result.revisions]:result.revisions);setNextBefore(result.nextBefore);setHistoryDraft(id);setHistorySide(side);setHistoryOpen(true)}catch(e){setError(e instanceof Error?e.message:'Unable to load history')}}
 async function openMine(){
  setBusy(true);setError('')
  try{const result=await requestRef.current('/drafts/'+draftId);setHead(result.draft.head);setLeft(draftId);setLeftSnapshot(result);setSaved(JSON.stringify({sections:result.sections,name:result.draft.name,baseVersion:result.base_version}));setPreview(null);setStatus('Latest saved revision is shown on the left. Your edits are kept; review differences before saving.')}
  catch(e){setError(e instanceof Error?e.message:'Unable to load latest revision')}finally{setBusy(false)}
 }
 async function discard(){
  if(!window.confirm('Discard unsaved changes in this working draft? Saved revision history will be kept.'))return
  setBusy(true);setError('')
  try{
   if(head){const snapshot:Snapshot=await requestRef.current('/drafts/'+draftId);setSections(snapshot.sections);setName(snapshot.draft.name);setHead(snapshot.draft.head);setSources(snapshot.sources);setBase({version:snapshot.base_version,sections:snapshot.baseSections});setSaved(JSON.stringify({sections:snapshot.sections,name:snapshot.draft.name,baseVersion:snapshot.base_version}))}
   else {setSections(doc.sections);setBase({version:doc.version,sections:doc.sections});setName('My constitution draft');setSources([]);setSaved(JSON.stringify({sections:doc.sections,name:'My constitution draft',baseVersion:doc.version}))}
   setUndo([]);setRedo([]);setPreview(null);setMessage('');setStatus('Unsaved changes discarded. Saved history is kept.')
  }catch(e){setError(e instanceof Error?e.message:'Unable to load saved revision')}finally{setBusy(false)}
 }
 async function save(confirm=false){
  setBusy(true);setError('')
  const payload=confirm&&preview?preview.payload:{id:draftId,expectedHead:head,name,baseVersion:base.version,sections,message,sources}
  try{
   const result=await requestRef.current('/drafts',{method:'POST',body:JSON.stringify({...payload,...(confirm&&preview?{confirm:true,previewId:preview.previewId}:{})})})
   if(!confirm){setPreview({previewId:result.previewId,payload});return}
   setHead(result.revision);setSaved(JSON.stringify({sections:payload.sections,name:payload.name,baseVersion:payload.baseVersion}));setMessage('');setPreview(null);setStatus(`Saved revision ${result.revision}. Shared with active LifeTech members.`);setHistoryOpen(false);setDirectoryRefresh(previous=>previous+1)
  }catch(e){setPreview(null);setError(e instanceof Error?e.message:'Unable to save draft')}finally{setBusy(false)}
 }
 function accept(source:Comparison,section:Section,block:ReturnType<typeof compareParagraphs>[number]){
  update(section.id,acceptBlock(section.text,block));setSources(previous=>[...previous.slice(-99),{source:source.source,revision:source.revision,sectionId:section.id,element:block.text.join('\n\n').slice(0,200)||'Remove passage'}]);setStatus('Copied into your draft. You can edit or undo it.')
 }
 function renderSource(source:Comparison|null,section:Section,side:string){
  if(!source)return <div className="merge-source" key={side}>Loading draft…</div>
  const text=source.sections.find(item=>item.id===section.id)?.text||'',original=base.sections.find(item=>item.id===section.id)?.text||''
  const conflict=section.text!==original&&text!==original&&text!==section.text
  return <div className={'merge-source'+(conflict?' merge-conflict':'')} key={side} aria-label={`${source.label}: ${section.title}`}>
   <div className="merge-source-caption">{source.label}{conflict&&<span>Both differ from base · choose wording manually</span>}</div>
   {compareParagraphs(section.text,text).map((block,index)=>block.unchanged?<p className="merge-block merge-equal" key={index}>{block.text.join('\n\n')}</p>:<button disabled={!canEdit||busy} type="button" className={'merge-block merge-copy '+(!block.text.length?'merge-deletion':'merge-addition')} key={index} onClick={()=>accept(source,section,block)} title="Copy this change into your draft">
    <span className="merge-copy-label">{block.text.length?(block.start===block.end?'＋ Insert into mine':'→ Replace in mine'):'− Remove from mine'}</span>
    {block.text.length?block.text.join('\n\n'):<del>{section.text.split('\n\n').slice(block.start,block.end).join('\n\n')}</del>}
    {block.end>block.start&&block.text.length>0&&<span className="merge-replaced"><strong>Replaces in your draft:</strong><del>{section.text.split('\n\n').slice(block.start,block.end).join('\n\n')}</del></span>}
   </button>)}
   {source.source==='gpt'&&<p className="merge-review-status">Recommendation: {doc.gptSuggestions.find(s=>s.sectionId===section.id)?.decision||'pending'}. Copying it does not approve or adopt it.</p>}
  </div>
 }
 const visible=sections.filter(section=>(!filter||`${section.title} ${section.text}`.toLowerCase().includes(filter.toLowerCase()))&&(!changesOnly||comparisons.some(source=>source&&source.sections.find(item=>item.id===section.id)?.text!==section.text)))
 return <section className="draft-merge-workspace" aria-label="Constitution draft comparison" onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();if(canEdit&&!busy&&dirty&&message.trim()&&name.trim())void save();else setStatus('Enter a save note to save a new revision.')}}}>
  <div className="merge-toolbar">
   <div><h2>Compare and build your draft</h2><p>Click a highlighted change to bring it into your draft. Edit your text in the center. Saved drafts are visible to active LifeTech members.</p></div>
   {!canEdit&&<p><Link to="/users/login?next=%2Fgovernance%2Fdocuments%2Flifetech-constitution">Sign in</Link> with active LifeTech membership to edit and search member drafts.</p>}
   <div className="merge-controls"><label>Find a person or draft<input type="search" value={search} disabled={!canEdit} placeholder="Search shared drafts" onChange={e=>setSearch(e.target.value)}/></label><label>Comparison<select value={three?'3':'2'} onChange={e=>setThree(e.target.value==='3')}><option value="2">2 panes</option><option value="3">3 panes</option></select></label><label>Find a section<input type="search" value={filter} onChange={e=>setFilter(e.target.value)}/></label><label className="merge-checkbox"><input type="checkbox" checked={changesOnly} onChange={e=>setChangesOnly(e.target.checked)}/>Only differing sections</label>
    <button disabled={!undo.length||busy} onClick={()=>{setRedo(stack=>[...stack,sections]);setSections(undo[undo.length-1]);setUndo(stack=>stack.slice(0,-1));setPreview(null)}}>Undo</button><button disabled={!redo.length||busy} onClick={()=>{setUndo(stack=>[...stack,sections]);setSections(redo[redo.length-1]);setRedo(stack=>stack.slice(0,-1));setPreview(null)}}>Redo</button>
   </div>
   {error&&<p role="alert">{error} Your current text has been kept.</p>}<p role="status">{status||'Start from the current organization text.'} {dirty?'Unsaved changes':head?`Saved · revision ${head}`:'No personal draft saved yet'}</p>
   {base.version!==doc.version&&<p>The organization text is now revision {doc.version}; your base is revision {base.version}. Compare with “Current organization text” before proposing changes. <button disabled={busy} onClick={()=>{setBase({version:doc.version,sections:doc.sections});setPreview(null);setStatus('Base updated; your wording is preserved. Review differences before saving.')}}>Use current revision as my base</button></p>}
  </div>
  <div className={'merge-columns '+(three?'merge-three':'merge-two')}>
   <div className="merge-pane-heading">{leftSnapshot&&<button onClick={()=>void loadHistory(undefined,left,'left')}>Source version history</button>}<DraftPicker label="Compare left" value={left} onChange={id=>{setLeft(id);setHistoryOpen(false)}} entries={entries} onMore={()=>void moreDrafts()} hasMore={nextOffset!==null} baseLabel={`Common base · r${base.version}`} selectedLabel={comparisons[0]?.label}/> </div>
   <div className="merge-pane-heading merge-mine"><h3>Your editable draft</h3><label>Draft name<input maxLength={120} value={name} disabled={!canEdit||busy} onChange={e=>{setName(e.target.value);setPreview(null)}}/></label><span>{head?`r${head} · ${name}`:'New draft'} · author: you</span></div>
   {three&&<div className="merge-pane-heading">{rightSnapshot&&<button onClick={()=>void loadHistory(undefined,right,'right')}>Source version history</button>}<DraftPicker label="Compare right" value={right} onChange={id=>{setRight(id);setHistoryOpen(false)}} entries={entries} onMore={()=>void moreDrafts()} hasMore={nextOffset!==null} baseLabel={`Common base · r${base.version}`} selectedLabel={comparisons[1]?.label}/></div>}
   {visible.map(section=><div className="merge-section-row" key={section.id}>
    <h3 id={'merge-'+section.id}>{section.title}</h3>
    {renderSource(comparisons[0],section,'left')}
    <div className="merge-editor"><label><span className="sr-only">Your draft: {section.title}</span><textarea rows={Math.max(12,Math.min(45,section.text.split('\n').length+4))} maxLength={50000} value={section.text} disabled={!canEdit||busy} onChange={e=>update(section.id,e.target.value)} spellCheck/></label><p>{section.text===base.sections.find(item=>item.id===section.id)?.text?'Unchanged from base':'Edited from base'}</p><button disabled={!canEdit||!canPropose||busy||section.text===doc.sections.find(item=>item.id===section.id)?.text||base.version!==doc.version||!section.text.trim()} onClick={()=>onPropose(section)}>Propose this section for adoption</button></div>
    {three&&renderSource(comparisons[1],section,'right')}
   </div>)}
  </div>
  {!visible.length&&<p>No matching sections.</p>}
  {canEdit&&<div className="merge-save-bar"><label>Save note<input maxLength={500} placeholder="Describe this revision" value={message} disabled={busy} onChange={e=>{setMessage(e.target.value);setPreview(null)}}/></label><button disabled={busy||!dirty||!message.trim()||!name.trim()} onClick={()=>void save()}>Save new revision</button><button disabled={busy||!dirty} onClick={()=>void discard()}>Discard unsaved edits</button><button disabled={busy||!head} onClick={()=>void loadHistory()}>Version history</button><button disabled={busy||!head} onClick={()=>void openMine()}>Compare latest saved (keep edits)</button><button disabled={busy} onClick={()=>{setDraftId(crypto.randomUUID());setHead(0);setSaved('');setSources(previous=>[...previous.slice(-99),{source:draftId,revision:String(head),sectionId:'all',element:'Fork draft'}]);setName(name+' (copy)');setPreview(null);setHistoryOpen(false);setStatus('New draft copy ready to save.')}}>Save as a new draft</button>
   <label>Open one of your saved drafts<select value="" disabled={busy||dirty} onChange={async e=>{if(!e.target.value)return;setBusy(true);try{const snapshot:Snapshot=await requestRef.current('/drafts/'+e.target.value);setDraftId(snapshot.draft.id);setHead(snapshot.draft.head);setName(snapshot.draft.name);setSections(snapshot.sections);setSources(snapshot.sources);setBase({version:snapshot.base_version,sections:snapshot.baseSections});setSaved(JSON.stringify({sections:snapshot.sections,name:snapshot.draft.name,baseVersion:snapshot.base_version}));setUndo([]);setRedo([]);setHistoryOpen(false);setPreview(null)}catch(e){setError(e instanceof Error?e.message:'Unable to open draft')}finally{setBusy(false)}}}><option value="">Choose your draft</option>{entries.filter(entry=>entry.owner_id===userId).map(entry=><option value={entry.id} key={entry.id}>{entry.name} · r{entry.head}</option>)}</select></label>
  </div>}
  {historyOpen&&<aside className="merge-history"><h3>{historySide==='mine'?'Your':'Source'} revision history</h3><p>Restoring creates a new revision when saved; earlier revisions are retained.</p>{history.map(revision=><article key={revision.revision}><strong>r{revision.revision}</strong> · {new Date(revision.created_at).toLocaleString()} · {revision.message}<p>Parent: {revision.parent_revision||'initial'} · SHA-256: <code>{revision.content_hash}</code></p><button disabled={busy} onClick={async()=>{setBusy(true);try{const snapshot:Snapshot=await requestRef.current(`/drafts/${historyDraft}?revision=${revision.revision}`);if(historySide==='left'){setLeftSnapshot(snapshot);setStatus(`Left pane shows revision ${revision.revision}`);return}if(historySide==='right'){setRightSnapshot(snapshot);setStatus(`Right pane shows revision ${revision.revision}`);return}edit(snapshot.sections);setSources(previous=>[...previous.slice(-99),{source:draftId,revision:String(revision.revision),sectionId:'all',element:'Restore historical snapshot'}]);setMessage(`Restore revision ${revision.revision}`);setStatus('Historical wording loaded. Save to append a new revision.')}catch(e){setError(e instanceof Error?e.message:'Unable to restore revision')}finally{setBusy(false)}}}>{historySide==='mine'?'Restore wording into my draft':'Compare this revision'}</button></article>)}{nextBefore&&<button onClick={()=>void loadHistory(nextBefore,historyDraft,historySide)}>Older revisions</button>}<button onClick={()=>setHistoryOpen(false)}>Close history</button></aside>}
  {blocker.state==='blocked'&&<div className="governance-preview" role="dialog" aria-modal="true" aria-labelledby="leave-draft-title"><div><h2 id="leave-draft-title">Leave unsaved edits?</h2><p>Save a revision before leaving to retain these changes.</p><button onClick={()=>blocker.reset()}>Keep editing</button><button onClick={()=>blocker.proceed()}>Discard unsaved edits and leave</button></div></div>}
  {preview&&<div className="governance-preview" role="dialog" aria-modal="true" aria-labelledby="save-draft-title"><div><h2 id="save-draft-title">Save revision {head+1}</h2><p>{name} · {message}</p><p>This snapshot will be shared with active LifeTech members. It does not change the organization’s adopted text.</p><p>{sections.filter(section=>section.text!==base.sections.find(item=>item.id===section.id)?.text).length} sections differ from base revision {base.version}.</p><button disabled={busy} onClick={()=>void save(true)}>Confirm save</button><button disabled={busy} onClick={()=>setPreview(null)}>Keep editing</button></div></div>}
 </section>
}
