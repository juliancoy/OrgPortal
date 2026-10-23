import { pidpUrl } from '../../config/pidp'
export class SessionEnded extends Error {}
const LOGOUT_PENDING_KEY='orgportal.auth.logoutPending'
let logoutPending=false
function pendingLogout(){try{return logoutPending || localStorage.getItem(LOGOUT_PENDING_KEY)==='1'}catch{return logoutPending}}
export function beginBrowserSignIn(){logoutPending=false;try{localStorage.removeItem(LOGOUT_PENDING_KEY)}catch{/* Cookie-based sign-in still works without local storage. */}}
async function completeLogout(signal?:AbortSignal){
 try{
  const response=await fetch(pidpUrl('/auth/session/logout'),{method:'POST',credentials:'include',cache:'no-store',signal})
  if(response.ok || response.status===401){beginBrowserSignIn();return true}
 }catch{/* Keep explicit sign-out intent until the server can revoke the session. */}
 return false
}
export async function logoutBrowserSession(){
 logoutPending=true;try{localStorage.setItem(LOGOUT_PENDING_KEY,'1')}catch{/* In-memory intent keeps the current tab signed out. */}
 return completeLogout()
}

/** Only an authoritative authentication rejection ends a remembered login. */
export async function restoreSessionToken(signal?: AbortSignal): Promise<string> {
 if(pendingLogout()){await completeLogout(signal);throw new SessionEnded('Signed out')}
 const response=await fetch(pidpUrl('/auth/session-token'),{credentials:'include',cache:'no-store',signal})
 if(response.status===401 || response.status===403)throw new SessionEnded('Session expired or signed out')
 if(!response.ok)throw new Error('Session service temporarily unavailable')
 const data=await response.json() as {access_token?:string}
 if(typeof data.access_token!=='string' || !data.access_token.trim())throw new Error('Invalid session response')
 return data.access_token.trim()
}
