import { pidpUrl } from '../../config/pidp'

export class McpHandoffError extends Error {
 readonly needsSignIn:boolean
 readonly retryable:boolean
 constructor(message:string,needsSignIn=false,retryable=false){super(message);this.needsSignIn=needsSignIn;this.retryable=retryable}
}

/** Establish a browser-bound identity bridge; this does not approve OAuth access. */
export async function continueMcpToConsent(request:string) {
 let metadata:Response
 try{metadata=await fetch(pidpUrl(`/oauth/mcp/handoff?${new URLSearchParams({request})}`),{credentials:'include',cache:'no-store'})}
 catch{throw new McpHandoffError('Connection interrupted before account confirmation. Check your connection and try again.',false,true)}
 if(metadata.status>=500||metadata.status===429)throw new McpHandoffError('The connection service is temporarily unavailable. Try again shortly.',false,true)
 if(metadata.status===401)throw new McpHandoffError('Your browser sign-in is no longer active. Sign in again to review permissions.',true)
 if(!metadata.ok){
  const failure=await metadata.json().catch(()=>({})) as {error?:string}
  throw new McpHandoffError(failure.error==='login_expired'?'This connection link has expired. Start sign-in again from your MCP client.':'Unable to load this connection. Start sign-in again from your MCP client.')
 }
 let connection:{portal_origin:string;issuer:string}
 try{connection=await metadata.json()}catch{throw new McpHandoffError('Connection interrupted before account confirmation. Check your connection and try again.',false,true)}
 const issuer=new URL(connection.issuer)
 if(connection.portal_origin!==window.location.origin||issuer.protocol!=='https:'||issuer.origin!==connection.issuer||issuer.username||issuer.password){
  throw new McpHandoffError('This connection belongs to a different portal.')
 }
 let response:Response
 try{response=await fetch(pidpUrl('/oauth/mcp/handoff'),{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({request})})}
 catch{throw new McpHandoffError('Connection interrupted during account confirmation. Start a new connection from your MCP client; this request will not be retried automatically.')}
 if(response.status===401)throw new McpHandoffError('Your browser sign-in is no longer active. Sign in again to review permissions.',true)
 if(!response.ok){
  const failure=await response.json().catch(()=>({})) as {error?:string}
  throw new McpHandoffError(failure.error==='login_expired'?'This connection link has expired. Start a new connection from your MCP client.':'Unable to confirm this connection. Start a new connection from your MCP client.')
 }
 let data:{redirect_url:string}
 try{data=await response.json()}catch{throw new McpHandoffError('The account confirmation response was incomplete. Start a new connection from your MCP client; this request will not be retried automatically.')}
 const target=new URL(data.redirect_url)
 if(target.origin!==issuer.origin||target.pathname!=='/oauth/mcp/resume'||target.hash||target.username||target.password||target.searchParams.getAll('code').length!==1||!target.searchParams.get('code')||[...target.searchParams.keys()].some(key=>key!=='code')){
  throw new McpHandoffError('The identity provider returned an invalid destination.')
 }
 return target.toString()
}
