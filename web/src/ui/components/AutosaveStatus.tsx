import type {AutosaveState} from '../hooks/autosaveQueue'
export function AutosaveStatus({state,label='Changes',onRetry}:{state:AutosaveState;label?:string;onRetry:()=>unknown}){
 return <div className="autosave-status"><span role={state.status==='error'?'alert':'status'} aria-live="polite">{state.status==='saved'?`${label} saved.`:state.status==='saving'?`Saving ${label.toLowerCase()}…`:state.status==='pending'?'Changes pending…':state.error||'Could not save changes.'}</span>{state.status==='error'&&<button type="button" className="btn-secondary" onClick={()=>onRetry()}>Retry saving</button>}</div>
}
