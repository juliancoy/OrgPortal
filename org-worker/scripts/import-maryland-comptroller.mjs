// Explicit authenticated publication of a reviewed local source batch.
// Refresh credentials stay in the existing OS keyring. No credentials are logged.
import {readFile,mkdir,writeFile,appendFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {credentialStore} from './upload-connection.mjs';
import {browserLogin} from './event-upload.mjs';
import {accountCommand} from './mcp-account-client.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const {values}=parseArgs({options:{file:{type:'string'},'expected-sha256':{type:'string'},'expected-commit':{type:'string'},connection:{type:'string',default:'platform-admin'},apply:{type:'boolean'},directory:{type:'string'}}});
if(!values.file||!values['expected-sha256']||!values['expected-commit'])throw Error('Supply --file, --expected-sha256 and --expected-commit; add --apply to publish');
const resource='https://lifetech.fyi/api/org/mcp',issuer='https://orgportal.cc';
const organizationId='ef646755-9443-4c7b-ba4b-a7a29754f666';
const base=`https://lifetech.fyi/api/org/api/network/orgs/${organizationId}/comptroller`;
const bytes=await readFile(values.file),digest=createHash('sha256').update(bytes).digest('hex');
if(digest!==values['expected-sha256'])throw Error('Source file does not match reviewed SHA256');
const rows=bytes.toString().trim().split('\n').map(line=>JSON.parse(line));
const expected=new Map(),expectedSources=new Map();
for(const row of rows){
 if(!Number.isSafeInteger(row.amount_cents)||!row.source_sha256)throw Error('Invalid source observation');
 const v=expected.get(row.dataset)||{records:0,amount_cents:0};v.records++;v.amount_cents+=row.amount_cents;expected.set(row.dataset,v);
 expectedSources.set(row.source_sha256,(expectedSources.get(row.source_sha256)||0)+1);
}
if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Duplicate source identities');
const directory=resolve(values.directory||new URL('../../artifacts/maryland-comptroller/receipts/',import.meta.url).pathname);
await mkdir(directory,{recursive:true,mode:0o700});
const stateFile=resolve(directory,'progress.json');
let state={digest,offset:0,pending:null};
try{state=JSON.parse(await readFile(stateFile,'utf8'));if(state.digest!==digest)throw Error('Receipt directory belongs to a different dataset');}catch(error){if(error.code!=='ENOENT')throw error;}
const save=async()=>{const temporary=stateFile+'.tmp';await writeFile(temporary,JSON.stringify(state)+'\n',{mode:0o600});await rename(temporary,stateFile);};
const store=await credentialStore(resource,issuer,values.connection);
let account,client;
try{
 const saved=await store.load();if(!saved?.refreshToken)throw Error('Saved operator connection is unavailable; no automatic sign-in is attempted');
 account=await browserLogin(resource,issuer,undefined,false,{store,scope:'org:portal.read org:portal.write'});
 const identity=await accountCommand({resource,issuer,action:'whoami'},account);
 if(identity.account.email!=='julian@codecollective.us'||identity.account.emailVerified!==true||!identity.account.isOperator)throw Error('Expected verified julian@codecollective.us operator identity');
 if(identity.server.commit!==values['expected-commit'])throw Error('MCP is not running the expected release commit');
 console.log(JSON.stringify({account:identity.account.email,operator:true,commit:identity.server.commit,records:rows.length,digest,apply:!!values.apply}));
 let previousRequest=0;
 client=new Client({name:'OrgPortal reviewed Comptroller import',version:'1.3.0'});
 const transport=new StreamableHTTPClientTransport(new URL(resource),{fetch:async(url,init)=>{
  const delay=1100-(Date.now()-previousRequest);if(delay>0)await new Promise(r=>setTimeout(r,delay));previousRequest=Date.now();
  const headers=new Headers(init?.headers);headers.set('authorization',`Bearer ${await account.accessToken()}`);
  return fetch(url,{...init,headers,redirect:'error',signal:AbortSignal.timeout(60000)});
 }});
 await client.connect(transport);
 const request=async(path,body)=>{
  let name,args;
  if(body){name=body.confirm?'apply_maryland_comptroller_import':'preview_maryland_comptroller_import';args=body;}
  else {name='get_maryland_comptroller_import_status';const url=new URL(path);args={organizationId,...(url.searchParams.get('previewId')?{previewId:url.searchParams.get('previewId')}:{})};}
  const result=await client.callTool({name,arguments:args});
  if(result.isError||!result.structuredContent)throw Error('MCP import failed; inspect the saved receipt and server operation status before retrying');
  return result.structuredContent;
 };
 if(state.pending){
  const receipt=await request(`${base}/status?previewId=${encodeURIComponent(state.pending.previewId)}`);
  if(receipt.status!=='completed')throw Error(`Prior apply is ${receipt.status}; inspect this receipt and source records before replay`);
  state.offset+=state.pending.count;state.pending=null;await save();
 }
 if(!values.apply){console.log(JSON.stringify({status:await request(`${base}/status`),resumeOffset:state.offset}));}
 else{
  while(state.offset<rows.length){
   const batch=rows.slice(state.offset,state.offset+250),payload={organizationId,rows:batch};
   const preview=await request(`${base}/import`,payload);
   if(preview.records!==batch.length||!preview.previewId)throw Error('Unexpected import preview');
   state.pending={previewId:preview.previewId,count:batch.length};await save();
   const result=await request(`${base}/import`,{...payload,confirm:true,previewId:preview.previewId});
   if(result.recorded+result.existing!==batch.length)throw Error('Import count mismatch; inspect the saved receipt');
   await appendFile(resolve(directory,'receipts.jsonl'),JSON.stringify({offset:state.offset,count:batch.length,...result})+'\n',{mode:0o600});
   state.offset+=batch.length;state.pending=null;await save();
   console.log(JSON.stringify({imported:state.offset,total:rows.length,previewId:preview.previewId,recorded:result.recorded,existing:result.existing}));
  }
  const actual=await request(`${base}/status`);
  for(const [dataset,total] of expected){const v=actual.totals.find(r=>r.dataset===dataset);if(!v||v.records!==total.records||v.amount_cents!==total.amount_cents)throw Error('Production source counts or signed-cent totals do not reconcile');}
  if(actual.totals.length!==expected.size||actual.sources.length!==expectedSources.size||actual.sources.some(s=>expectedSources.get(s.source_sha256)!==s.records))throw Error('Production source checksum counts do not reconcile');
  const report={productionApplied:true,verifiedAt:new Date().toISOString(),commit:identity.server.commit,account:identity.account.email,digest,records:rows.length,totals:actual.totals,sourceCount:actual.sources.length};
  await writeFile(resolve(directory,'production-verification.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
 }
}finally{await client?.close();await account?.close?.();await store.release();}
