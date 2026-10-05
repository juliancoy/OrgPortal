import { pidpUrl } from '../../config/pidp'

export class McpHandoffError extends Error {
 readonly needsSignIn:boolean
 constructor(message:string,needsSignIn=false){super(message);this.needsSignIn=needsSignIn}
}

/** Establish a browser-bound identity bridge; this does not approve OAuth access. */
export async function continueMcpToConsent(request:string) {
 const metadata=await fetch(pidpUrl(`/oauth/mcp/handoff?${new URLSearchParams({request})}`),{credentials:'include',cache:'no-store'})
 if(metadata.status===401)throw new McpHandoffError('Your browser sign-in is no longer active. Sign in again to review permissions.',true)
 if(!metadata.ok){
  const failure=await metadata.json().catch(()=>({})) as {error?:string}
  throw new McpHandoffError(failure.error==='login_expired'?'This connection link has expired. Start sign-in again from your MCP client.':'Unable to load this connection. Start sign-in again from your MCP client.')
 }
 const connection=await metadata.json() as {portal_origin:string;issuer:string}
 const issuer=new URL(connection.issuer)
 if(connection.portal_origin!==window.location.origin||issuer.protocol!=='https:'||issuer.origin!==connection.issuer||issuer.username||issuer.password){
  throw new McpHandoffError('This connection belongs to a different portal.')
 }
 const response=await fetch(pidpUrl('/oauth/mcp/handoff'),{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({request})})
 if(response.status===401)throw new McpHandoffError('Your browser sign-in is no longer active. Sign in again to review permissions.',true)
 if(!response.ok)throw new McpHandoffError('Unable to continue. Start sign-in again from your MCP client.')
 const data=await response.json() as {redirect_url:string}
 const target=new URL(data.redirect_url)
 if(target.origin!==issuer.origin||target.pathname!=='/oauth/mcp/resume'||target.hash||target.username||target.password||target.searchParams.getAll('code').length!==1||!target.searchParams.get('code')||[...target.searchParams.keys()].some(key=>key!=='code')){
  throw new McpHandoffError('The identity provider returned an invalid destination.')
 }
 return target.toString()
}
