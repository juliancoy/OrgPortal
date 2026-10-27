import {useEffect,useMemo,useRef,useState} from 'react'
import {createAutosaveQueue,type AutosaveState} from './autosaveQueue'
export function useAutosave<T>({value,save,scope,enabled=true,delay=600}:{value:T;save:(value:T,previous:T)=>Promise<void>;scope:string;enabled?:boolean;delay?:number}){
 const [state,setState]=useState<AutosaveState>({status:'saved'})
 const queue=useRef<ReturnType<typeof createAutosaveQueue<T>>|null>(null)
 // Each account/organization gets a separate callback session, including on exit.
 const session=useMemo(()=>({save}),[scope]);session.save=save
 const key=JSON.stringify(value)
 useEffect(()=>{
  if(!enabled)return
  const current=createAutosaveQueue(value,(next,previous)=>session.save(next,previous),setState,delay)
  queue.current=current;setState({status:'saved'})
  return()=>{if(queue.current===current)queue.current=null;current.dispose()}
 },[scope,enabled,delay])
 useEffect(()=>{if(enabled)queue.current?.update(value)},[key,scope,enabled])
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(queue.current&&queue.current.state().status!=='saved'){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[])
 const visibleState:AutosaveState=enabled&&queue.current&&state.status==='saved'&&!queue.current.isSaved(value)?{status:'pending'}:state
 return {...visibleState,flush:()=>queue.current?.flush()??Promise.resolve(true),retry:()=>queue.current?.retry()}
}
