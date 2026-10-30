import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {Link} from 'react-router-dom'
import X from 'lucide-react/dist/esm/icons/x.mjs'
import Star from 'lucide-react/dist/esm/icons/star.mjs'
import {OrgImage} from './media/OrgImage'
import {BioMarkdown} from './profile/BioMarkdown'
import {RegistrantAvatar} from './RegistrantAvatar'
import {SubmissionAttachments} from './SubmissionAttachments'
import {SubmissionActions} from './SubmissionActions'
import type {PresentationApplication} from './EventPresentations'
import type {Submission} from './EventSubmissions'

type Props={row:Submission;eventId:string;mode:'hover'|'modal';anchor:HTMLButtonElement;selected:boolean;voting:boolean;disabled:boolean;quotaText:string;canManage:boolean;application?:PresentationApplication;onVote:()=>void;onClose:()=>void;onKeepOpen:()=>void;onEnter:()=>void;onLeave:()=>void;onEdit:(application:PresentationApplication)=>void;onDeleted:(id:string)=>void}
export function ApplicantDetails({row,eventId,mode,anchor,selected,voting,disabled,quotaText,canManage,application,onVote,onClose,onKeepOpen,onEnter,onLeave,onEdit,onDeleted}:Props){
 const root=useRef<HTMLDivElement&HTMLDialogElement>(null),closeButton=useRef<HTMLButtonElement>(null)
 const [pending,setPending]=useState(false)
 const modal=mode==='modal',id=`applicant-details-${row.submission_id}`,heading=id+'-heading'
 function requestClose(){if(pending&&!window.confirm('Files have not finished uploading. Close and discard selected files?'))return;onClose()}
 useLayoutEffect(()=>{
  const panel=root.current;if(!panel)return
  if(modal){panel.showModal();closeButton.current?.focus();return()=>{panel.close();if(anchor.isConnected)anchor.focus();else document.querySelector<HTMLElement>('.presentation-applications h2')?.focus()}}
  function position(){
   if(!panel)return
   const rect=anchor.getBoundingClientRect(),width=Math.min(500,window.innerWidth-32),height=panel.offsetHeight
   let left=rect.right+12,top=rect.top
   if(left+width>window.innerWidth-16){left=rect.left-width-12;if(left<16){left=Math.max(16,Math.min(rect.left+44,window.innerWidth-width-16));top=rect.bottom+8}}
   panel.style.width=width+'px';panel.style.left=left+'px';panel.style.top=Math.max(16,Math.min(top,window.innerHeight-height-16))+'px'
  }
  position();const observer=new ResizeObserver(position);observer.observe(panel);window.addEventListener('resize',position)
  return()=>{observer.disconnect();window.removeEventListener('resize',position)}
 },[modal,anchor])
 useEffect(()=>{
  if(modal)return
  function key(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();onClose();if(root.current?.contains(document.activeElement))anchor.focus()}}
  function outside(event:PointerEvent){if(!root.current?.contains(event.target as Node)&&!anchor.contains(event.target as Node))onClose()}
  function scroll(event:Event){if(!root.current?.contains(event.target as Node))onClose()}
  document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);window.addEventListener('scroll',scroll,true)
  return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);window.removeEventListener('scroll',scroll,true)}
 },[modal,anchor,onClose])
 const content=<>
  <header className="applicant-overlay-header"><OrgImage src={row.image_url} alt=""/><div><p>Demo Day applicant</p><h2 id={heading}>{row.organization_name}</h2></div><button ref={closeButton} type="button" className="applicant-close" aria-label="Close applicant details" onClick={requestClose}><X size={20} aria-hidden="true"/></button></header>
  <div className="applicant-overlay-content"><h3>{row.title}</h3>{row.status!=='submitted'&&<p className="applicant-status">{row.status}</p>}<BioMarkdown value={row.summary}/>
   {!!row.presenters?.length&&<section className="applicant-people"><h3>Presenters</h3><ul>{row.presenters.map((person,index)=><li key={index}><RegistrantAvatar name={person.name} photoUrl={person.photo||null}/><span>{person.name}{person.pending&&<small>Invitation pending</small>}</span></li>)}</ul></section>}
   <SubmissionAttachments eventId={eventId} submissionId={row.submission_id} initial={row.attachments} canManage={modal&&canManage} onPendingChange={setPending}/>
   {modal&&application&&<section className="applicant-management"><h3>Your application</h3><SubmissionActions eventId={eventId} application={application} onEdit={onEdit} onDeleted={onDeleted}/></section>}
  </div>
  <footer className="applicant-overlay-footer"><Link className="btn-secondary" to={`/orgs/${encodeURIComponent(row.organization_slug)}`}>View company</Link>{!modal&&<button className="btn-secondary" type="button" onClick={onKeepOpen}>Open details</button>}
   {voting&&<button className={`applicant-vote${selected?' is-selected':''}`} type="button" aria-pressed={selected} aria-label={`${selected?'Remove favorite':'Favorite'}: ${row.title} (${row.favorites} stars)`} disabled={disabled} onClick={onVote}><Star size={20} fill={selected?'currentColor':'none'} aria-hidden="true"/><span>{row.favorites}</span></button>}
   {quotaText&&<p className="submission-vote-limit" role="status">{quotaText}</p>}
  </footer>
 </>
 return createPortal(modal?<dialog ref={root} id={id} className="applicant-overlay applicant-modal" aria-labelledby={heading} onCancel={event=>{if(event.target===event.currentTarget){event.preventDefault();requestClose()}}} onPointerDown={event=>{if(event.target!==event.currentTarget)return;const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)requestClose()}}>{content}</dialog>:<div ref={root} id={id} className="applicant-overlay applicant-hover" role="dialog" aria-modal="false" aria-labelledby={heading} onPointerEnter={onEnter} onPointerLeave={onLeave} onFocusCapture={onEnter} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))onLeave()}}>{content}</div>,document.body)
}
