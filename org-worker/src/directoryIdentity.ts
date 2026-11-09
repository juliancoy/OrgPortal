import { HTTPException } from 'hono/http-exception';
export type DirectoryAlias = {account_id:string;canonical_user_id:string};
export type DirectoryIdentity = {aliases:DirectoryAlias[];people:{user_id:string;user_name:string}[]};
type Entry=DirectoryIdentity&{base:string;token:string;expires:number};
const cache=new WeakMap<object,Entry>();

/** Private, bounded read model. Never use these aliases to grant domain permissions. */
export async function loadDirectoryIdentities(env:Env):Promise<DirectoryIdentity> {
 const token=env.PIDP_DIRECTORY_TOKEN?.trim();
 // Local fixture deployments without identity credentials keep their isolated IDs.
 if(!token)return {aliases:[],people:[]};
 const base=(env.PIDP_BASE_URL||'https://orgportal.cc/pidp').replace(/\/+$/,'');
 const saved=cache.get(env);
 if(saved&&saved.base===base&&saved.token===token&&saved.expires>Date.now())return {aliases:saved.aliases,people:saved.people};
 try{
  const response=await fetch(base+'/service/directory-identities',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}',redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Unavailable');
  const data=await response.json() as DirectoryIdentity;
  if(!Array.isArray(data.aliases)||data.aliases.length>20000)throw Error('Invalid alias response');
  const byId=new Map<string,string>();
  for(const row of data.aliases){
   if(typeof row.account_id!=='string'||typeof row.canonical_user_id!=='string'||!row.account_id.trim()||!row.canonical_user_id.trim()||row.account_id.length>200||row.canonical_user_id.length>200)throw Error('Invalid identity');
   if(byId.has(row.account_id)&&byId.get(row.account_id)!==row.canonical_user_id)throw Error('Ambiguous identity');
   if(row.account_id!==row.canonical_user_id)byId.set(row.account_id,row.canonical_user_id);
  }
  for(const person of byId.values())if(byId.has(person))throw Error('Noncanonical identity chain');
  const aliases=[...byId].map(([account_id,canonical_user_id])=>({account_id,canonical_user_id}));
  if(!Array.isArray(data.people)||data.people.length>20000)throw Error('Invalid people response');
  const people=data.people.map(row=>{
   if(typeof row.user_id!=='string'||!row.user_id.trim()||row.user_id.length>200||typeof row.user_name!=='string'||row.user_name.length>1000)throw Error('Invalid person');
   return {user_id:row.user_id,user_name:row.user_name.trim()&&!row.user_name.includes('@')?row.user_name.trim():'Portal member'};
  });
  cache.set(env,{base,token,expires:Date.now()+60000,aliases,people});return {aliases,people};
 }catch{throw new HTTPException(503,{message:'Identity directory is temporarily unavailable'});}
}

export async function loadDirectoryAliases(env:Env):Promise<DirectoryAlias[]> {return (await loadDirectoryIdentities(env)).aliases;}
