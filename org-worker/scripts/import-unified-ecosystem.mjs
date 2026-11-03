// Explicit reviewed public-source import. Credentials remain in the OS keyring.
import {readFile,mkdir,writeFile,appendFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {credentialStore} from './upload-connection.mjs';
import {browserLogin} from './event-upload.mjs';
import {accountCommand} from './mcp-account-client.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const {values}=parseArgs({options:{file:{type:'string'},'expected-sha256':{type:'string'},'expected-commit':{type:'string'},apply:{type:'boolean'},directory:{type:'string'},connection:{type:'string',default:'platform-admin'}}});
if(!values.file||!values['expected-sha256']||!values['expected-commit'])throw Error('Supply reviewed file SHA256 and deployed commit');
const bytes=await readFile(values.file);if(createHash('sha256').update(bytes).digest('hex')!==values['expected-sha256'])throw Error('Bootstrap file changed');
const {datasetId,rows}=JSON.parse(bytes),organizationId='ef646755-9443-4c7b-ba4b-a7a29754f666',resource='https://lifetech.fyi/api/org/mcp',issuer='https://orgportal.cc';
const directory=resolve(values.directory||'../../../.runtime/unified-ecosystem/import');await mkdir(directory,{recursive:true,mode:0o700});
const path=resolve(directory,'progress.json');let state={datasetId,offset:0,pending:null};try{state=JSON.parse(await readFile(path,'utf8'));if(state.datasetId!==datasetId)throw Error('Wrong dataset receipt directory');}catch(e){if(e.code!=='ENOENT')throw e;}
const save=async()=>{await writeFile(path+'.tmp',JSON.stringify(state)+'\n',{mode:0o600});await rename(path+'.tmp',path);};
const store=await credentialStore(resource,issuer,values.connection);let account,client;
try{
 if(!(await store.load())?.refreshToken)throw Error('Saved operator connection required');
 account=await browserLogin(resource,issuer,undefined,false,{store,scope:'org:portal.read org:portal.write'});
 const identity=await accountCommand({resource,issuer,action:'whoami'},account);
 if(identity.account.email!=='julian@codecollective.us'||!identity.account.emailVerified||!identity.account.isOperator||identity.server.commit!==values['expected-commit'])throw Error('Account or deployed commit differs from reviewed import');
 let previous=0;client=new Client({name:'Reviewed unified ecosystem import',version:'1.0.0'});
 await client.connect(new StreamableHTTPClientTransport(new URL(resource),{fetch:async(url,init)=>{
 const delay=1100-(Date.now()-previous);if(delay>0)await new Promise(r=>setTimeout(r,delay));previous=Date.now();const headers=new Headers(init?.headers);headers.set('authorization',`Bearer ${await account.accessToken()}`);
 return fetch(url,{...init,headers,redirect:'error',signal:AbortSignal.timeout(60000)});
 }}));
 const call=async(name,args)=>{const result=await client.callTool({name,arguments:args});if(result.isError||!result.structuredContent)throw Error('Import failed; inspect the pending receipt before retrying');return result.structuredContent;};
 const status=previewId=>call('get_ecosystem_dataset_status',{organizationId,datasetId,...(previewId?{previewId}:{})});
 if(state.pending){const receipt=await status(state.pending.previewId);if(receipt.status!=='completed')throw Error(`Pending receipt is ${receipt.status}; do not replay blindly`);if(state.pending.action==='publish')state.published=true;else state.offset+=state.pending.count;state.pending=null;await save();}
 console.log(JSON.stringify({account:identity.account.email,commit:identity.server.commit,datasetId,total:rows.length,offset:state.offset,apply:!!values.apply}));
 const apply=async payload=>{const preview=await call('preview_ecosystem_dataset',payload);state.pending={previewId:preview.previewId,count:payload.rows.length,action:payload.action};await save();
 const result=await call('apply_ecosystem_dataset',{...payload,confirm:true,previewId:preview.previewId});await appendFile(resolve(directory,'receipts.jsonl'),JSON.stringify({offset:state.offset,...result})+'\n',{mode:0o600});if(payload.action==='stage')state.offset+=payload.rows.length;else state.published=true;state.pending=null;await save();};
 if(values.apply){
 while(state.offset<rows.length){const batch=[];let size=0;while(state.offset+batch.length<rows.length&&batch.length<200){const row=rows[state.offset+batch.length],length=Buffer.byteLength(JSON.stringify(row));if(batch.length&&size+length>450000)break;batch.push(row);size+=length;}
 await apply({organizationId,datasetId,action:'stage',rows:batch});console.log(JSON.stringify({staged:state.offset,total:rows.length}));}
 const verification=await status();if(verification.digest!==datasetId||verification.counts.reduce((n,r)=>n+r.records,0)!==rows.length)throw Error('Live checksum/count reconciliation failed');
 if(!state.published)await apply({organizationId,datasetId,action:'publish',rows:[]});
 const final=await status();if(final.dataset?.state!=='active')throw Error('Dataset is not active');
 const report={...final,account:identity.account.email,commit:identity.server.commit,verifiedAt:new Date().toISOString()};await writeFile(resolve(directory,'verification.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
 }else console.log(JSON.stringify(await status()));
}finally{await client?.close();await account?.close?.();await store.release();}
