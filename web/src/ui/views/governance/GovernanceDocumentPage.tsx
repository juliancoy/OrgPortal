import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { refreshRuntimeTokenFromSession } from '../../../infrastructure/auth/sessionToken'
import { DiffView } from '../../components/governance/DiffView'
import { DraftMergeWorkspace } from './DraftMergeWorkspace'
import './governance-document.css'
import { RatificationRehearsal } from './RatificationRehearsal'

export type Section = { id: string; title: string; text: string }
type Document = { candidateHash:string; title: string; introduction: string; status: string; version: number; sourceUrl: string; sourceReferences: {label:string;url:string}[]; gptContributor:{id:string;name:string;profileUrl:string;codexUrl:string;mcpUrl:string}; gptSuggestions: {hash:string;decision:'pending'|'approved'|'denied';reviewedAt:string|null;sectionId:string;title:string;author:string;preparedWith:string;status:string;original:string;replacement:string}[]; organizationId: string | null; sections: Section[]; pendingRatificationId: string | null; openChangeTickets: number; ratification: { version:number; motionId:string; ratifiedAt:string; effectiveAt:string } | null }
export type Ticket = { document_action?: 'amend' | 'ratify'; ratification_snapshot?:string; ratification_authority?:string; ratification_notice_at?:string;  id: string; title: string; body: string; status: string; proposer_id: string; proposer_name: string; document_section: string; document_version: number; document_base: string; proposed_body_diff: string; chair_id: string | null; voting_deadline: string | null; created_at: string }
type Access = { userId: string; role: string | null; canPropose: boolean; canVote: boolean }
type Detail = { ratification: {version:number;ratified_at:string;effective_at:string} | null; motion: Ticket; appliedVersion: number | null; results: { yea: number; nay: number; abstain: number; quorum_required: number; quorum_met: boolean; electorate_changed?: boolean; document_changed?: boolean }; comments: { id: string; user_name: string; body: string }[]; events: { id: string; action: string; detail: string; created_at: string }[] }
const path = '/governance/documents/lifetech-constitution'
const api = '/api/org/api/governance/documents/lifetech-constitution'

export function GovernanceDocumentPage() {
 const { ticketId } = useParams()
 const { token } = useAuth()
 const [doc,setDoc]=useState<Document|null>(null),[tickets,setTickets]=useState<Ticket[]>([]),[detail,setDetail]=useState<Detail|null>(null)
 const [access,setAccess]=useState<Access|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [editingSection,setEditingSection]=useState<string|null>(null)
 const [sectionId,setSectionId]=useState('overview'),[title,setTitle]=useState(''),[reason,setReason]=useState(''),[replacement,setReplacement]=useState('')
 const [authority,setAuthority]=useState(''),[ratificationReason,setRatificationReason]=useState(''),[procedureConfirmed,setProcedureConfirmed]=useState(false)
 const [comment,setComment]=useState(''),[note,setNote]=useState('')
 const [preview,setPreview]=useState<{operation:string;args:Record<string,unknown>;previewId:string;label:string}|null>(null)
 async function request(suffix:string,init:RequestInit={}) {
  const send=(auth:string|null)=>fetch(api+suffix,{...init,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})}})
  let response=await send(token)
  if(response.status===401&&token){const fresh=await refreshRuntimeTokenFromSession();if(fresh)response=await send(fresh)}
  if(!response.ok) { const text=await response.text();try{throw new Error(JSON.parse(text).detail||text)}catch(e){if(e instanceof SyntaxError)throw new Error(text);throw e} }
  return response.json()
 }
 async function load() {
  const [document,list]=await Promise.all([request(''),request('/tickets')])
  setDoc(document);setTickets(list.tickets)
  if(!doc)setReplacement(document.sections[0]?.text||'')
  if(ticketId)setDetail(await request('/tickets/'+encodeURIComponent(ticketId)));else setDetail(null)
  setAccess(token?await request('/access'):null)
 }
 useEffect(()=>{setError('');setPreview(null);void load().catch(e=>setError(e.message))},[ticketId,token]) // eslint-disable-line react-hooks/exhaustive-deps

 async function review(operation:string,args:Record<string,unknown>,label:string) {
  setBusy(true);setError('')
  try {const result=await request('/operations',{method:'POST',body:JSON.stringify({operation,args:{organizationId:doc?.organizationId,...args}})});setPreview({operation,args:{organizationId:doc?.organizationId,...args},previewId:result.previewId,label})}
  catch(e){setError(e instanceof Error?e.message:'Unable to preview action')}finally{setBusy(false)}
 }
 async function apply() {
  if(!preview)return
  setBusy(true);setError('')
  try {await request('/operations',{method:'POST',body:JSON.stringify({operation:preview.operation,args:{...preview.args,confirm:true,previewId:preview.previewId}})});setPreview(null);setEditingSection(null);setComment('');setNote('');setProcedureConfirmed(false);await load()}
  catch(e){setPreview(null);setError(e instanceof Error?e.message:'Unable to apply action')}finally{setBusy(false)}
 }
 const motion=detail?.motion
 const action=(name:string,label:string,extra:Record<string,unknown>={})=>review('action',{motionId:motion?.id,action:name,...extra},label)
 const organizer=access?.canVote
 const chair=organizer&&motion?.chair_id===access?.userId
 const ratifying=motion?.document_action==='ratify'
 const recordingNotice=ratifying&&motion?.status==='discussion'&&!motion.ratification_notice_at
 const procedureAction=motion?.status==='seconded'?'recognize':recordingNotice?'give-notice':'open-voting'
 const procedureLabel=motion?.status==='seconded'?'Chair’s statement of the exact question':recordingNotice?'Notice delivery record for every organizer':'Chair’s record: notice delivered to every organizer and debate exhausted'
 const snapshot=ratifying&&motion?.ratification_snapshot?JSON.parse(motion.ratification_snapshot) as {title:string;sections:Section[]}:null
 const changeEditor=doc?<form onSubmit={e=>{e.preventDefault();void review('propose',{title,body:reason,documentChange:{documentId:'lifetech-constitution',sectionId,version:doc.version,replacement}},'Open this change ticket')}}>
     <label>Title to change<select disabled={!!editingSection} aria-label="Title to change" value={sectionId} onChange={e=>{setSectionId(e.target.value);setReplacement(doc.sections.find(s=>s.id===e.target.value)?.text||'');setPreview(null)}}>{doc.sections.map(s=><option value={s.id} key={s.id}>{s.title}</option>)}</select></label>
     <label>Ticket title<input required maxLength={500} value={title} onChange={e=>{setTitle(e.target.value);setPreview(null)}}/></label>
     <label>Reason for the change<textarea aria-label="Reason for the change" required maxLength={10000} value={reason} onChange={e=>{setReason(e.target.value);setPreview(null)}}/></label>
     <label>Complete replacement text<textarea aria-label="Complete replacement text" required rows={14} maxLength={50000} value={replacement} onChange={e=>{setReplacement(e.target.value);setPreview(null)}}/></label>
     <DiffView original={doc.sections.find(s=>s.id===sectionId)?.text||''} proposed={replacement}/>
     <button disabled={busy} type="submit">Review change ticket</button>
    </form>:null
 return <main className={'governance-document'+(!ticketId?' governance-merge-page':'')}>
  <nav aria-label="Governance"><Link to={path}>LifeTech Constitution and Bylaws</Link> · <Link to={path+'#tickets'}>Change tickets</Link> · <a href="#gpt-suggestions">GPT recommendations</a></nav>
  {error&&<p role="alert">{error}</p>}
  {!doc&&!error&&<p>Loading constitution…</p>}
  {doc&&!ticketId&&<>
   <header className="merge-page-header"><p className="governance-draft">{doc.status} · Organization revision {doc.version}</p><h1>{doc.title}</h1><p>{doc.introduction}</p></header>
   <DraftMergeWorkspace key={access?.userId||'guest'} doc={doc} userId={access?.userId} canEdit={!!access?.canPropose} canPropose={!doc.pendingRatificationId} request={request} onPropose={section=>{setSectionId(section.id);setReplacement(section.text);setTitle(`Amend ${section.title}`);setReason('Changes assembled in my comparison draft.');setEditingSection(null);setPreview(null);setTimeout(()=>{const tools=document.getElementById('governance-tools');if(tools instanceof HTMLDetailsElement)tools.open=true;document.getElementById('suggest')?.scrollIntoView({block:'start'})},0)}}/>
   <details className="merge-governance-tools" id="governance-tools"><summary>GPT approval, change tickets, ratification, and source references</summary>
   <p>Draft research references: {doc.sourceReferences.map(reference=><a key={reference.url} href={reference.url}>{reference.label} </a>)}</p>
   {!doc.ratification&&<RatificationRehearsal candidate={doc} />}
   <section id="ratification"><h2>Lock the final draft for real voting</h2>
    {doc.ratification?<p role="status">Ratified on {new Date(doc.ratification.ratifiedAt).toLocaleString()}, effective {new Date(doc.ratification.effectiveAt).toLocaleString()}. <Link to={path+'/tickets/'+doc.ratification.motionId}>Read the adoption record and original adopted text</Link>.</p>:<>
     <ol><li>Finish the draft and resolve open change tickets.</li><li>Organizers agree in advance on the ratification procedure: organizer voting, majority participation quorum, two-thirds approval, seven days of notice, and a 24-hour electronic ballot. Record the agreement in meeting minutes.</li><li>Open a ratification ticket to capture and freeze this full revision.</li><li>Obtain a second, have the chair state the question, and record delivery of the full candidate and procedure to every organizer.</li><li>After notice and discussion, hold the organizer ballot. On adoption, publish the record and effective date.</li></ol>
     <p>Ratification takes effect immediately when the chair records a passing result. Creating a ticket or accepting an edit does not ratify the Constitution.</p>
     {doc.pendingRatificationId?<p><Link to={path+'/tickets/'+doc.pendingRatificationId}>Continue the active ratification ticket</Link>. The candidate is frozen until that ticket is resolved.</p>:doc.openChangeTickets>0?<p>Resolve {doc.openChangeTickets} open change ticket(s) before starting ratification.</p>:organizer?<form onSubmit={e=>{e.preventDefault();void review('propose',{title:`Ratify LifeTech Constitution — revision ${doc.version}`,body:ratificationReason,documentRatification:{documentId:'lifetech-constitution',version:doc.version,candidateHash:doc.candidateHash,authorityRecord:authority}},`Lock revision ${doc.version} for real ratification voting`)}}>
      <label>Reason to ratify this revision<textarea aria-label="Reason to ratify this revision" required maxLength={10000} value={ratificationReason} onChange={e=>{setRatificationReason(e.target.value);setPreview(null)}}/></label>
      <label>Prior organizer agreement and meeting record<textarea aria-label="Prior organizer agreement and meeting record" required minLength={20} maxLength={10000} value={authority} onChange={e=>{setAuthority(e.target.value);setPreview(null)}}/></label>
      <p>Identify the date, participants, decision, and minutes that independently authorized this procedure. The unratified draft cannot authorize its own ballot.</p>
      <p>Locking captures this exact draft and freezes changes until the real ratification ticket is resolved. The real ballot retains all organizer, notice, quorum, and voting requirements.</p><button disabled={busy}>Review and lock this draft for voting</button>
     </form>:<p>An active LifeTech organizer can open the ratification ticket once the draft is ready.</p>}
    </>}
   </section>
   {doc.gptSuggestions.length>0&&<section id="gpt-suggestions"><h2>GPT recommendations</h2><p>Prepared by GPT using Codex. These proposals are separate from the current draft and are not submitted change tickets, votes, or adopted amendments. Authored by <a href={doc.gptContributor.profileUrl}>{doc.gptContributor.name}</a> · <a href={doc.gptContributor.codexUrl}>Codex</a> · <a href={doc.gptContributor.mcpUrl}>LifeTech MCP server</a>. A submitting member’s identity remains recorded on each actual ticket.</p>
    <p>Organizers can approve a recommendation for a change ticket, deny it, or reopen review. Decisions are shared across accounts. Approval here is editorial review; adoption still requires the recorded organizer ballot.</p>
    {!token&&<Link to={'/users/login?next='+encodeURIComponent(path+'#gpt-suggestions')}>Sign in to review recommendations</Link>}
    {token&&!organizer&&<p>Active LifeTech organizers approve or deny recommendations. Members can prepare change tickets.</p>}
    <div className="gpt-recommendation-grid">{doc.gptSuggestions.map(suggestion=>{const current=doc.sections.find(section=>section.id===suggestion.sectionId);const applicable=current?.text===suggestion.original;const related=tickets.filter(ticket=>ticket.document_section===suggestion.sectionId&&ticket.proposed_body_diff===suggestion.replacement);return <article className="gpt-recommendation" key={suggestion.sectionId}>
     <header><h3>{suggestion.title}</h3><span className={'recommendation-status recommendation-'+suggestion.decision}>{suggestion.decision==='approved'?'Approved for proposal':suggestion.decision==='denied'?'Denied':'Awaiting review'}</span></header>
     <p>GPT · Prepared with {suggestion.preparedWith}</p><p className="recommendation-excerpt">{suggestion.replacement.length>360?suggestion.replacement.slice(0,360)+'…':suggestion.replacement}</p>
     {!applicable&&<p>The section has changed since this suggestion was prepared. Rebase it before submitting.</p>}
     <details><summary>Compare current wording and GPT recommendation</summary><h4>Prepared recommendation</h4><DiffView original={suggestion.original} proposed={suggestion.replacement}/>{!applicable&&<><h4>Current wording</h4><div className="governance-document-text">{current?.text}</div></>}</details>
     {suggestion.reviewedAt&&<p>Last reviewed: <time dateTime={suggestion.reviewedAt}>{new Date(suggestion.reviewedAt).toLocaleString()}</time></p>}
     {organizer&&!doc.pendingRatificationId&&<div className="governance-actions">
      <button disabled={busy||!applicable||suggestion.decision==='approved'} onClick={()=>void review('review-suggestion',{sectionId:suggestion.sectionId,hash:suggestion.hash,candidateHash:doc.candidateHash,decision:'approved'},`Approve for proposal: ${suggestion.title}`)}>Approve recommendation</button>
      <button disabled={busy||suggestion.decision==='denied'} onClick={()=>void review('review-suggestion',{sectionId:suggestion.sectionId,hash:suggestion.hash,candidateHash:doc.candidateHash,decision:'denied'},`Deny recommendation: ${suggestion.title}`)}>Deny recommendation</button>
      {suggestion.decision!=='pending'&&<button disabled={busy} onClick={()=>void review('review-suggestion',{sectionId:suggestion.sectionId,hash:suggestion.hash,candidateHash:doc.candidateHash,decision:'pending'},`Reopen review: ${suggestion.title}`)}>Reopen review</button>}
     </div>}
     {related.map(ticket=><p key={ticket.id}><Link to={path+'/tickets/'+ticket.id}>Change ticket: {ticket.status}</Link></p>)}
     {access?.canPropose&&!doc.pendingRatificationId&&applicable&&suggestion.decision!=='denied'&&!related.some(ticket=>!['passed','failed','withdrawn'].includes(ticket.status))&&<button onClick={()=>{setSectionId(suggestion.sectionId);setReplacement(suggestion.replacement);setTitle(`GPT suggestion: ${suggestion.title}`);setReason('GPT-prepared governance suggestion, reviewed and submitted by the signed-in member.');setPreview(null);setEditingSection(null);setTimeout(()=>document.getElementById('suggest')?.scrollIntoView({block:'start'}),0)}}>Prepare change ticket</button>}
    </article>})}</div>
   </section>}
   <section id="suggest" onFocus={()=>{const tools=document.getElementById('governance-tools');if(tools instanceof HTMLDetailsElement)tools.open=true}}><h2>Open a change ticket</h2><p>Active LifeTech members may propose and discuss changes. Organizers second motions and vote. Every proposal starts from an exact document revision and retains its original wording.</p>
    {!token?<Link to="/users/login?next=%2Fgovernance%2Fdocuments%2Flifetech-constitution">Sign in to suggest a change</Link>:doc.pendingRatificationId?<p>The full candidate is frozen for ratification. Discuss it on the <Link to={path+'/tickets/'+doc.pendingRatificationId}>ratification ticket</Link>.</p>:!access?.canPropose?<p>Your account needs active LifeTech membership to open a ticket. Contact a LifeTech organizer through the existing membership process.</p>:(!editingSection&&changeEditor)}
   </section>
   <section id="tickets"><h2>Change tickets</h2>{tickets.length===0?<p>No change tickets yet.</p>:<ul>{tickets.map(t=><li key={t.id}><Link to={path+'/tickets/'+t.id}>{t.title}</Link> — {t.status} · {t.proposer_name}</li>)}</ul>}</section>
   </details>
  </>}
  {motion&&detail&&<>
   <header><p className="governance-draft">{motion.status} · Proposed against revision {motion.document_version}</p><h1>{motion.title}</h1><p>Proposed by {motion.proposer_name}</p><p>{motion.body}</p></header>
   <p>Motion → organizer second → chair states question → discussion → seven-day notice → 24-hour ballot → recorded result.</p>
   {ratifying&&<p>This motion adopts the full Constitution, effective immediately upon a passing recorded result.</p>}
   {snapshot?<section><h2>Constitution submitted for ratification</h2><p>This is the frozen text of revision {motion.document_version}.</p>{snapshot.sections.map(section=><section key={section.id}><h3>{section.title}</h3><div className="governance-document-text">{section.text}</div></section>)}<h3>Prior organizer agreement</h3><p className="governance-document-text">{motion.ratification_authority}</p></section>:<DiffView original={motion.document_base} proposed={motion.proposed_body_diff}/>}
   {ratifying&&detail.ratification&&<p role="status">Constitution ratified. Effective {new Date(detail.ratification.effective_at).toLocaleString()}.</p>}
   {detail.results.document_changed&&<p role="status">The full candidate changed. This ballot cannot ratify it; open a new ticket with fresh notice.</p>}
   {!ratifying&&motion.status==='passed'&&<p role="status">{detail.appliedVersion?`Adopted into ${doc?.ratification?'constitution':'draft'} revision ${detail.appliedVersion}.`:'Adopted, but the document has changed. File a rebased ticket to incorporate this change without overwriting another revision.'}</p>}
   {detail.results.electorate_changed&&<p role="status">The organizer roll changed. This ballot cannot adopt a change; file a newly noticed ticket.</p>}
   <section><h2>Procedure</h2><p>Quorum: {detail.results.quorum_required} organizer participants. Constitutional changes require at least two thirds of yes/no votes; abstentions record participation only. {ratifying?'This is a full-Constitution ratification ballot.':doc?.ratification?'This is an amendment to the ratified Constitution.':'This is a change to an unratified draft.'}</p>
    {ratifying&&motion.ratification_notice_at&&<p>Full-candidate notice recorded: {new Date(motion.ratification_notice_at).toLocaleString()}. Voting may open seven full days later.</p>}
    {motion.voting_deadline&&<p>Ballot closes: <time dateTime={motion.voting_deadline}>{new Date(motion.voting_deadline).toLocaleString()}</time></p>}
    <div className="governance-actions">
     {organizer&&motion.status==='proposed'&&motion.proposer_id!==access?.userId&&<button disabled={busy} onClick={()=>void action('second','Second this motion')}>Second motion</button>}
     {access?.userId===motion.proposer_id&&motion.status==='proposed'&&<button disabled={busy} onClick={()=>void action('withdraw','Withdraw this unseconded ticket')}>Withdraw ticket</button>}
    </div>
    {organizer&&(motion.status==='seconded'||(chair&&motion.status==='discussion'))&&<form onSubmit={e=>{e.preventDefault();void action(procedureAction,motion.status==='seconded'?'State the question and open discussion':recordingNotice?'Record notice and start the seven-day period':'Open the 24-hour ballot',{procedureNote:note,...(recordingNotice?{ratificationAuthorized:procedureConfirmed}:{})})}}>
     <label>{procedureLabel}<textarea aria-label={procedureLabel} required maxLength={10000} value={note} onChange={e=>{setNote(e.target.value);setPreview(null)}}/></label>
     {motion.status==='discussion'&&<p>Do not use this action to cut off debate. A disputed closure requires a properly decided Previous Question in a chaired meeting.</p>}
     {recordingNotice&&<label><input type="checkbox" checked={procedureConfirmed} onChange={e=>{setProcedureConfirmed(e.target.checked);setPreview(null)}}/>I confirm the prior organizer agreement independently authorized this ratification procedure.</label>}
     <button disabled={busy||(recordingNotice&&!procedureConfirmed)}>{motion.status==='seconded'?'State question':recordingNotice?'Review notice record':'Review opening ballot'}</button>
    </form>}
    {organizer&&motion.status==='voting'&&new Date(motion.voting_deadline||0).getTime()>Date.now()&&<div className="governance-actions">{(['yea','nay','abstain'] as const).map(choice=><button disabled={busy} key={choice} onClick={()=>void action('vote','Record '+choice,{choice})}>{choice==='yea'?'Vote yes':choice==='nay'?'Vote no':'Record abstention'}</button>)}</div>}
    {chair&&motion.status==='voting'&&new Date(motion.voting_deadline||0).getTime()<=Date.now()&&<button disabled={busy} onClick={()=>void action('resolve','Announce and record the result')}>Review result</button>}
    <p>Yes: {detail.results.yea} · No: {detail.results.nay} · Abstain: {detail.results.abstain}</p>
    {!token&&<Link to={'/users/login?next='+encodeURIComponent(path+'/tickets/'+motion.id)}>Sign in to participate</Link>}
   </section>
   <section><h2>Discussion</h2>{detail.comments.map(c=><article key={c.id}><strong>{c.user_name}</strong><p className="governance-document-text">{c.body}</p></article>)}
    {access?.canPropose&&<form onSubmit={e=>{e.preventDefault();void action('comment','Post this comment',{body:comment})}}><label>Comment<textarea aria-label="Comment" required maxLength={10000} value={comment} onChange={e=>{setComment(e.target.value);setPreview(null)}}/></label><button disabled={busy}>Review comment</button></form>}
   </section>
   <section><h2>Procedure record</h2><ol>{detail.events.map(event=><li key={event.id}><strong>{event.action}</strong> · {new Date(event.created_at).toLocaleString()}<p className="governance-document-text">{event.detail}</p></li>)}</ol></section>
  </>}
  {preview&&<div className="governance-preview" role="dialog" aria-modal="true" aria-labelledby="preview-title"><div><h2 id="preview-title">{preview.label}</h2><p>Review the exact action before confirming.</p>
   {preview.operation==='propose'?<><h3>{String(preview.args.title)}</h3><p>{String(preview.args.body)}</p><div className="governance-document-text">{preview.args.documentRatification?`Ratify all nine titles of revision ${doc?.version}, effective immediately upon adoption. Prior procedure agreement: ${(preview.args.documentRatification as {authorityRecord:string}).authorityRecord}`:String((preview.args.documentChange as {replacement:string}).replacement)}</div></>:<p className="governance-document-text">{String(preview.args.procedureNote||preview.args.body||preview.args.choice||preview.label)}</p>}
   <div className="governance-actions"><button disabled={busy} onClick={()=>void apply()}>Confirm action</button><button disabled={busy} onClick={()=>setPreview(null)}>Cancel</button></div>
  </div></div>}
 </main>
}
