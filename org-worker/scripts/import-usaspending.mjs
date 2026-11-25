// Explicit authenticated publication of a reviewed local source batch.
// Refresh credentials stay in the existing OS keyring. No credentials are logged.
import {readFile,mkdir,writeFile,appendFile,rename} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {readJsonLines} from './json-lines.mjs';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {credentialStore} from './upload-connection.mjs';
import {browserLogin} from './event-upload.mjs';
import {accountCommand} from './mcp-account-client.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {readBaseline,rowFingerprint,verifyBaselineSources} from './federal-import-baseline.mjs';
const {values}=parseArgs({options:{file:{type:'string'},'expected-sha256':{type:'string'},'expected-commit':{type:'string'},baseline:{type:'string'},'baseline-sha256':{type:'string'},connection:{type:'string',default:'platform-admin'},apply:{type:'boolean'},directory:{type:'string'}}});
if(!!values.baseline!==!!values['baseline-sha256'])throw Error('Baseline file and reviewed checksum are required together');
const baseline=values.baseline?await readBaseline(values.baseline,values['baseline-sha256']):null;let baselineSeen=0;
if(!values.file||!values['expected-sha256']||!values['expected-commit']||!values.directory)throw Error('Supply --file, --expected-sha256, --expected-commit and a private --directory; add --apply to publish');
const resource='https://lifetech.fyi/api/org/mcp',issuer='https://orgportal.cc';
const organizationId='ef646755-9443-4c7b-ba4b-a7a29754f666';
const base=`https://lifetech.fyi/api/org/api/network/orgs/${organizationId}/usaspending`;
const sourceRows=()=>readJsonLines(values.file);
const hash=createHash('sha256');for await(const bytes of createReadStream(values.file))hash.update(bytes);
const digest=hash.digest('hex');
if(digest!==values['expected-sha256'])throw Error('Source file does not match reviewed SHA256');
const expected=new Map(),expectedSources=new Map();let totalRows=0,previousId='';
for await(const row of sourceRows()){
 if(!Number.isSafeInteger(row.amount_cents)||!row.source_sha256||row.id<=previousId)throw Error('Invalid or unsorted/duplicate federal source observation');
 previousId=row.id;totalRows++;
 if(baseline?.rows.has(row.id)){if(baseline.rows.get(row.id)!==rowFingerprint(row))throw Error('Union changed a preserved baseline record');baselineSeen++;}
 const key=row.dataset+':'+row.metadata.fiscal_year,v=expected.get(key)||{records:0,amount_cents:0};v.records++;v.amount_cents+=row.amount_cents;expected.set(key,v);
 expectedSources.set(row.source_sha256,(expectedSources.get(row.source_sha256)||0)+1);
}
if(baseline&&baselineSeen!==baseline.rows.size)throw Error('Union omitted baseline records');
const directory=resolve(values.directory);
await mkdir(directory,{recursive:true,mode:0o700});
const stateFile=resolve(directory,'progress.json');
let state={digest,baselineDigest:baseline?.digest||null,offset:0,pending:null};
try{state=JSON.parse(await readFile(stateFile,'utf8'));if(state.digest!==digest||(state.baselineDigest||null)!==(baseline?.digest||null))throw Error('Receipt directory belongs to a different dataset or baseline');}catch(error){if(error.code!=='ENOENT')throw error;}
const save=async()=>{const temporary=stateFile+'.tmp';await writeFile(temporary,JSON.stringify(state)+'\n',{mode:0o600});await rename(temporary,stateFile);};
const store=await credentialStore(resource,issuer,values.connection);
let account,client;
try{
 const saved=await store.load();if(!saved?.refreshToken)throw Error('Saved operator connection is unavailable; no automatic sign-in is attempted');
 account=await browserLogin(resource,issuer,undefined,false,{store,scope:'org:portal.read org:portal.write'});
 const identity=await accountCommand({resource,issuer,action:'whoami'},account);
 if(identity.account.email!=='julian@codecollective.us'||identity.account.emailVerified!==true||!identity.account.isOperator)throw Error('Expected verified julian@codecollective.us operator identity');
 if(identity.server.commit!==values['expected-commit'])throw Error('MCP is not running the expected release commit');
 console.log(JSON.stringify({account:identity.account.email,operator:true,commit:identity.server.commit,records:totalRows,digest,apply:!!values.apply}));
 let previousRequest=0;
 client=new Client({name:'OrgPortal reviewed USAspending import',version:'1.3.0'});
 const transport=new StreamableHTTPClientTransport(new URL(resource),{fetch:async(url,init)=>{
  const delay=1100-(Date.now()-previousRequest);if(delay>0)await new Promise(r=>setTimeout(r,delay));previousRequest=Date.now();
  const headers=new Headers(init?.headers);headers.set('authorization',`Bearer ${await account.accessToken()}`);
  return fetch(url,{...init,headers,redirect:'error',signal:AbortSignal.timeout(60000)});
 }});
 await client.connect(transport);
 const request=async(path,body)=>{
  let name,args;
  if(body){name=body.confirm?'apply_usaspending_import':'preview_usaspending_import';args=body;}
  else {name='get_usaspending_import_status';const url=new URL(path);args={organizationId,...(url.searchParams.get('previewId')?{previewId:url.searchParams.get('previewId')}:{})};}
  let result;
  for(let attempt=0;attempt<4;attempt++){
   result=await client.callTool({name,arguments:args});
   if(body||!result.isError||![429,502,503,504].includes(result.structuredContent?.error?.status)||attempt===3)break;
   await new Promise(r=>setTimeout(r,1000*2**attempt));
  }
  if(result.isError||!result.structuredContent)throw Error('MCP import failed: '+JSON.stringify(result.structuredContent?.error||result.content||{}).slice(0,3000)+'; inspect the saved receipt and server operation status before retrying');
  return result.structuredContent;
 };
 if(state.pending){
  const receipt=await request(`${base}/status?previewId=${encodeURIComponent(state.pending.previewId)}`);
  if(receipt.status!=='completed')throw Error(`Prior apply is ${receipt.status}; inspect this receipt and source records before replay`);
  state.offset+=state.pending.count;state.pending=null;await save();
 }
 if(!values.apply){console.log(JSON.stringify({status:await request(`${base}/status`),resumeOffset:state.offset}));}
 else{
  if(baseline)verifyBaselineSources(baseline,await request(`${base}/status`));
  async function* batches(){let batch=[],bytes=0,index=0;for await(const row of sourceRows()){
   if(baseline?.rows.has(row.id))continue;
   if(index++<state.offset)continue;
   const size=Buffer.byteLength(JSON.stringify(row))+1;
   if(batch.length&&(batch.length>=1000||bytes+size>3000000||Math.floor(parseInt(batch[0].id.split(':').at(-1)[0],16)/4)!==Math.floor(parseInt(row.id.split(':').at(-1)[0],16)/4))){yield batch;batch=[];bytes=0;}
   if(size>3000000)throw Error('Oversized source record');batch.push(row);bytes+=size;
  }if(batch.length)yield batch;}
  for await(const batch of batches()){
   const payload={organizationId,rows:batch};
   const preview=await request(`${base}/import`,payload);
   if(preview.records!==batch.length||!preview.previewId)throw Error('Unexpected import preview');
   state.pending={previewId:preview.previewId,count:batch.length};await save();
   const result=await request(`${base}/import`,{...payload,confirm:true,previewId:preview.previewId});
   if(result.recorded+result.existing!==batch.length)throw Error('Import count mismatch; inspect the saved receipt');
   await appendFile(resolve(directory,'receipts.jsonl'),JSON.stringify({offset:state.offset,count:batch.length,...result})+'\n',{mode:0o600});
   state.offset+=batch.length;state.pending=null;await save();
   console.log(JSON.stringify({imported:state.offset,total:totalRows-(baseline?.rows.size||0),preservedBaseline:baseline?.rows.size||0,previewId:preview.previewId,recorded:result.recorded,existing:result.existing}));
  }
  const actual=await request(`${base}/status`);
  for(const [dataset,total] of expected){const v=actual.totals.find(r=>r.dataset+':'+r.fiscal_year===dataset);if(!v||v.records!==total.records||v.amount_cents!==total.amount_cents)throw Error('Production source counts or signed-cent totals do not reconcile');}
  if(actual.totals.length!==expected.size||actual.sources.length!==expectedSources.size||actual.sources.some(s=>expectedSources.get(s.source_sha256)!==s.records))throw Error('Production source checksum counts do not reconcile');
  const report={productionApplied:true,verifiedAt:new Date().toISOString(),commit:identity.server.commit,account:identity.account.email,digest,records:totalRows,baselineDigest:baseline?.digest||null,preservedBaseline:baseline?.rows.size||0,totals:actual.totals,sourceCount:actual.sources.length};
  await writeFile(resolve(directory,'production-verification.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
 }
}finally{await client?.close();await account?.close?.();await store.release();}
