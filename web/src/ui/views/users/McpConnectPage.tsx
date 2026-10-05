import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { pidpSingleSignOnUrl } from '../../../config/pidp'
import { portalPath } from '../../../config/portalBase'
import { continueMcpToConsent, McpHandoffError } from '../../../infrastructure/auth/mcpHandoff'
import './McpConnectPage.css'

export function McpConnectPage() {
 const [params]=useSearchParams()
 const request=params.getAll('request').length===1?params.get('request')||'':''
 const [error,setError]=useState(''),[needsSignIn,setNeedsSignIn]=useState(false)
 const handoff=useRef<{request:string;promise:Promise<string>}|null>(null)
 useEffect(()=>{
  let active=true
  setError('');setNeedsSignIn(false)
  if(!/^login_[A-Za-z0-9_-]{43,100}$/.test(request)){
   setError('This connection link is invalid. Start sign-in again from your MCP client.')
   return
  }
  // Reuse the one-use handoff during React Strict Mode's effect remount.
  if(handoff.current?.request!==request)handoff.current={request,promise:continueMcpToConsent(request)}
  void handoff.current.promise.then(destination=>{if(active)window.location.assign(destination)}).catch(err=>{
   if(active){setError(err instanceof Error?err.message:'Unable to continue.');setNeedsSignIn(err instanceof McpHandoffError&&err.needsSignIn)}
  })
  return()=>{active=false}
 },[request])
 return <section className="portal-auth-page mcp-connect" aria-labelledby="mcp-connect-title">
  <div className="portal-auth-card mcp-connect-card">
   <header className="mcp-connect-heading"><p className="mcp-connect-eyebrow">Account connection</p><h1 id="mcp-connect-title">Review connection permissions</h1></header>
   {error?<p className="mcp-connect-error" role="alert">{error}</p>:<p className="mcp-connect-loading" role="status">Opening your account and permissions review…</p>}
   <div className="mcp-connect-actions">
    {needsSignIn&&<a className="mcp-connect-continue" href={pidpSingleSignOnUrl(`/users/mcp-connect?${new URLSearchParams({request})}`)}>Sign in again</a>}
    <a href={portalPath('/')} className="mcp-connect-cancel">Cancel</a>
   </div>
  </div>
 </section>
}
