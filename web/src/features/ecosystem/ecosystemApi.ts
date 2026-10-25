import { useEffect, useRef, useState } from 'react'
import { portalPath } from '../../config/portalBase'
import type { NetworkData } from './networkViewData'
export type QueryMeta = Pick<NetworkData,'governmentCoverage'|'nonprofitCoverage'> & { version:string;generatedAt:string }
export type QueryPage<T> = QueryMeta & {records:T[];total:number;offset:number;nextOffset:number|null}
export function ecosystemUrl(section:string,params:Record<string,string|number|undefined>={}) {
 const search=new URLSearchParams()
 for(const [key,value] of Object.entries(params))if(value!==undefined&&value!=='')search.set(key,String(value))
 return portalPath(`/api/ecosystem/${section}?${search}`)
}
export function useEcosystemQuery<T extends QueryMeta>(section:string,params:Record<string,string|number|undefined>={}) {
 const url=ecosystemUrl(section,params),version=useRef('')
 const [result,setResult]=useState<{url:string;data:T}|null>(null),[error,setError]=useState('')
 useEffect(()=>{
  const abort=new AbortController();setError('')
  const timer=setTimeout(()=>{
   const target=new URL(url,location.origin);if(version.current)target.searchParams.set('version',version.current)
   void fetch(target,{signal:abort.signal,credentials:'omit'}).then(async response=>{
    const value=await response.json()
    if(!response.ok)throw Error(value.error||'Public evidence could not load.')
    if(typeof value.version!=='string'||typeof value.generatedAt!=='string')throw Error('Invalid public evidence response')
    if(!abort.signal.aborted){version.current=value.version;setResult({url,data:value})}
   }).catch(error=>{if(!abort.signal.aborted)setError(error.message)})
  },150)
  return()=>{clearTimeout(timer);abort.abort()}
 },[url])
 return {data:result?.url===url?result.data:null,error}
}
