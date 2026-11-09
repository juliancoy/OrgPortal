import { HTTPException } from 'hono/http-exception';
export type DirectoryAlias = {account_id:string;canonical_user_id:string};
type Entry={base:string;token:string;expires:number;aliases:DirectoryAlias[]};
const cache=new WeakMap<object,Entry>();

/** Private, bounded read model. Never use these aliases to grant domain permissions. */
export async function loadDirectoryAliases(env:Env):Promise<DirectoryAlias[]> {
 const token=env.PIDP_DIRECTORY_TOKEN?.trim();
 // Local fixture deployments without identity credentials keep their isolated IDs.
 if(!token)return [];
 const base=(env.PIDP_BASE_URL||'https://orgportal.cc/pidp').replace(/\/+$/,'');
 const saved=cache.get(env);
 if(saved&&saved.base===base&&saved.token===token&&saved.expires>Date.now())return saved.aliases;
 try{
  const response=await fetch(base+'/service/directory-identities',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}',redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Unavailable');
  const data=await response.json() as {aliases:DirectoryAlias[]};
  if(!Array.isArray(data.aliases)||data.aliases.length>20000)throw Error('Invalid alias response');
  const byId=new Map<string,string>();
  for(const row of data.aliases){
   if(typeof row.account_id!=='string'||typeof row.canonical_user_id!=='string'||!row.account_id.trim()||!row.canonical_user_id.trim()||row.account_id.length>200||row.canonical_user_id.length>200)throw Error('Invalid identity');
   if(byId.has(row.account_id)&&byId.get(row.account_id)!==row.canonical_user_id)throw Error('Ambiguous identity');
   if(row.account_id!==row.canonical_user_id)byId.set(row.account_id,row.canonical_user_id);
  }
  for(const person of byId.values())if(byId.has(person))throw Error('Noncanonical identity chain');
  const aliases=[...byId].map(([account_id,canonical_user_id])=>({account_id,canonical_user_id}));
  cache.set(env,{base,token,expires:Date.now()+60000,aliases});return aliases;
 }catch{throw new HTTPException(503,{message:'Identity directory is temporarily unavailable'});}
}
