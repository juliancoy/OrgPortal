import {useContext,useEffect,useRef} from 'react'
import {UNSAFE_DataRouterContext,useBlocker} from 'react-router-dom'
export function PendingUploadGuard({pending,allowLeave,textOnly=false}:{pending:boolean;allowLeave?:()=>boolean;textOnly?:boolean}){
 const router=useContext(UNSAFE_DataRouterContext)
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(pending&&!allowLeave?.()){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[pending,allowLeave])
 return router&&pending?<RouteGuard pending={pending} allowLeave={allowLeave} textOnly={textOnly}/>:null
}
function RouteGuard({pending,allowLeave,textOnly=false}:{pending:boolean;allowLeave?:()=>boolean;textOnly?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null)
 const blocker=useBlocker(({currentLocation,nextLocation})=>pending&&!allowLeave?.()&&(currentLocation.pathname!==nextLocation.pathname||currentLocation.search!==nextLocation.search))
 useEffect(()=>{if(blocker.state==='blocked'&&!dialog.current?.open)dialog.current?.showModal()},[blocker.state])
 return blocker.state==='blocked'?<dialog ref={dialog} onCancel={event=>{event.preventDefault();blocker.reset()}} className="portal-card pending-upload-dialog" role="alertdialog" aria-modal="true" aria-labelledby="leave-application-title"><h2 id="leave-application-title">{textOnly?'Leave your application?':'Files haven’t finished uploading'}</h2><p>{textOnly?'Your unsent application details are not saved. Leaving now discards them.':'Your text draft is saved on this device. Leaving now discards selected files that have not uploaded and may interrupt a save.'}</p><button type="button" className="btn-primary" onClick={()=>blocker.reset()}>Keep working</button><button type="button" className="btn-secondary" onClick={()=>blocker.proceed()}>{textOnly?'Leave and discard details':'Leave and discard selected files'}</button></dialog>:null
}
