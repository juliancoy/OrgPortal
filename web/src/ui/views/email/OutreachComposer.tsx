import {useState} from 'react'
import {emailApi} from './emailApi'
import {parseOutreachCsv,type OutreachRow} from './outreachCsv'
export function OutreachComposer({token,groupId,disabled,onCreated}:{token:string|null;groupId:string;disabled:boolean;onCreated:(id:string)=>Promise<void>}){
 const [rows,setRows]=useState<OutreachRow[]>([]),[subject,setSubject]=useState(''),[body,setBody]=useState(''),[approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('')
 const [content,setContent]=useState({heading:'',tagline:'',sender_name:'',accent:'#155e59',logo_url:'',rsvp_url:'',rsvp_label:'RSVP',postal_address:'',image_data:''})
 async function save(){if(busy)return;setBusy(true);setError('');try{
  const draft=await emailApi<{id:string;duplicates:number;invalid:number}>(token,'/outreach','POST',{organizationId:groupId,subject,body,content,recipients:rows.map(r=>({...r,approved}))})
  let remaining=500;for(let i=0;i<43&&remaining>0;i++){const r=await emailApi<{remaining:number}>(token,`/outreach/${draft.id}/check`,'POST');remaining=r.remaining;setStatus(`Checking mail routing: ${remaining} addresses remaining…`)}
  await onCreated(draft.id);setStatus(`Draft saved. ${draft.duplicates} duplicates removed; ${draft.invalid} invalid addresses excluded. Review the eligible and held recipients below, then send a self-test.`)
 }catch(e){setError(e instanceof Error?e.message:'Unable to prepare outreach.')}finally{setBusy(false)}}
 return <section className="portal-card email-compose" aria-label="One-time outreach"><h2>One-time outreach</h2><p>Import a source-backed contact list for a reviewed invitation. These contacts are not added to subscriber lists. Current opt-outs and known delivery failures always stay excluded.</p>
 <label>Contact CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void file.text().then(text=>{setRows(parseOutreachCsv(text));setApproved(false);setError('')}).catch(err=>setError(err.message))}}/></label>
 <p className="muted">Columns: email, name (or organization), source_url, source_checked_at. Source checks must be within seven days. Review records against their published source before approval.</p>
 {rows.length>0&&<details><summary>{rows.length} imported rows · review evidence</summary><div className="email-table"><table><thead><tr><th>Contact</th><th>Source</th><th>Review notes</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{r.name}<br/>{r.email}</td><td>{/^https:\/\//.test(r.source_url)?<a href={r.source_url} target="_blank" rel="noreferrer">Published source</a>:r.source_url}<br/>{r.source_checked_at}</td><td><input aria-label={`Review notes for ${r.email}`} value={r.review_reason} onChange={e=>setRows(v=>v.map((x,n)=>n===i?{...x,review_reason:e.target.value}:x))}/></td></tr>)}</tbody></table></div></details>}
 <label className="email-checkbox"><input type="checkbox" checked={approved} disabled={busy} onChange={e=>setApproved(e.target.checked)}/><span>I reviewed the sources and approve these contacts for this one-time invitation.</span></label>
 <label>Outreach subject<input value={subject} maxLength={200} onChange={e=>setSubject(e.target.value)}/></label>
 <label>Outreach message<textarea rows={8} value={body} maxLength={20000} onChange={e=>setBody(e.target.value)}/></label>
 <details><summary>Branding, photo and RSVP</summary><div className="email-compose">
 {([{key:'sender_name',label:'Sender display name'},{key:'heading',label:'Heading'},{key:'tagline',label:'Tagline'},{key:'logo_url',label:'Logo URL (HTTPS)'},{key:'rsvp_url',label:'RSVP URL (HTTPS)'},{key:'rsvp_label',label:'RSVP button label'},{key:'postal_address',label:'Sender mailing address'}] as const).map(({key,label})=><label key={key}>{label}<input value={content[key]} onChange={e=>setContent(v=>({...v,[key]:e.target.value}))}/></label>)}
 <label>Brand color<input type="color" value={content.accent} onChange={e=>setContent(v=>({...v,accent:e.target.value}))}/></label>
 <label>Inline group photo (JPEG/PNG, under 300 KB)<input type="file" accept="image/jpeg,image/png" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>300000){setError('Choose a photo under 300 KB.');return}const reader=new FileReader();reader.onload=()=>setContent(v=>({...v,image_data:String(reader.result)}));reader.readAsDataURL(file)}}/></label>
 </div></details>
 {error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}
 <button disabled={busy||disabled||!rows.length||!approved||!subject.trim()||!body.trim()} onClick={()=>void save()}>{busy?'Preparing outreach…':'Save outreach draft & check recipients'}</button>
 </section>
}
