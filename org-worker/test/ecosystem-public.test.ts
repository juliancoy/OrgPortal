import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {TimebankDatabase} from './helpers/timebankDatabase';
import {importEcosystemDataset,ecosystemDatasetStatus,publicEcosystemRecords,publicEcosystemNativeRecords} from '../src/ecosystemPublic';
import {canonicalJson,previewFingerprint} from '../src/eventOperationStore';
function setup(){
 const db=Object.create(TimebankDatabase.prototype) as TimebankDatabase;Object.defineProperty(db,'sqlite',{value:new DatabaseSync(':memory:')});
 db.sqlite.exec('PRAGMA foreign_keys=ON');const dir=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())db.sqlite.exec(readFileSync(new URL(name,dir),'utf8'));
 db.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('test-org','Test','test-org')");return db;
}
const actor={id:'operator',name:'Operator',email:null,isOperator:true};
async function fixture(relationship:Record<string,unknown>={}){
 const values=[['organizations',{id:'source:one',name:'Source label'}],['relationships',{id:'e1',source:'source:one',target:null,sourceLabel:'Source',targetLabel:'Unresolved',kind:'mentoring',relationship:'mentoring',amount:null,currency:null,description:'Non-monetary mentoring',sourceUrl:'https://example.test/evidence',...relationship}],['metadata',{id:'data:schemaVersion',value:1}]] as const;
 const rows=await Promise.all(values.map(async([collection,value])=>({collection,key:await previewFingerprint(value.id),value,sha256:await previewFingerprint(value)})));
 rows.sort((a,b)=>(a.collection+'\t'+a.key)<(b.collection+'\t'+b.key)?-1:1);
 const bytes=new TextEncoder().encode(rows.map(r=>`${r.collection}\t${r.key}\t${r.sha256}\n`).join(''));
 const datasetId=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
 return {organizationId:'test-org',datasetId,action:'stage',rows};
}
async function apply(db:TimebankDatabase,input:unknown){const p=await importEcosystemDataset(db.asD1(),actor,input);return importEcosystemDataset(db.asD1(),actor,{...input as object,previewId:p.previewId,confirm:true});}

test('staging is invisible; full checksum publication exposes non-fiscal evidence in the master view and exports',async()=>{
 const db=setup();try{const ledgerBefore=db.sqlite.prepare('SELECT count(*) n FROM ledger_transactions').get()!.n;const input=await fixture();await apply(db,input);
 await assert.rejects(publicEcosystemRecords(db.asD1(),'relationships'),/not been published/);
 assert.equal(db.sqlite.prepare("SELECT count(*) n FROM master_transaction_records WHERE record_type='ecosystem_relationship'").get()!.n,0);
 const status=await ecosystemDatasetStatus(db.asD1(),actor,'test-org',input.datasetId);assert.ok('digest' in status);assert.equal(status.digest,input.datasetId);
 await apply(db,{...input,action:'publish',rows:[]});const records=await publicEcosystemRecords(db.asD1(),'relationships');
 assert.equal(records.records.length,1);assert.equal(records.records[0].value.kind,'mentoring');
 const master=db.sqlite.prepare("SELECT * FROM master_transaction_records WHERE record_type='ecosystem_relationship'").get()!;
 assert.equal(master.transaction_type,'mentoring');assert.equal(master.amount,null);assert.equal(master.from_organization_id,null);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM ledger_transactions').get()!.n,ledgerBefore);
 assert.ok((await publicEcosystemNativeRecords(db.asD1())).records.every(r=>r.record_type!=='ledger'&&r.record_type!=='ecosystem_relationship'&&!('from_account_id' in r))); 
 await assert.rejects(publicEcosystemRecords(db.asD1(),'relationships','', 'a'.repeat(64)),/changed/);
 await assert.rejects(publicEcosystemRecords(db.asD1(),'ledger'),/Unknown/);
 await assert.rejects(importEcosystemDataset(db.asD1(),actor,input),/immutable/);
 assert.equal(db.sqlite.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');
 }finally{db.sqlite.close();}
});
test('checksums, incompleteness, conflicting keys and one-use receipts fail closed',async()=>{
 const db=setup();try{const input=await fixture();await assert.rejects(importEcosystemDataset(db.asD1(),actor,{...input,rows:[{...input.rows[0],sha256:'a'.repeat(64)}]}),/checksum/);
 await apply(db,{...input,rows:input.rows.slice(0,1)});await assert.rejects(importEcosystemDataset(db.asD1(),actor,{...input,action:'publish',rows:[]}),/incomplete/);
 const p=await importEcosystemDataset(db.asD1(),actor,input);await importEcosystemDataset(db.asD1(),actor,{...input,confirm:true,previewId:p.previewId});
 await assert.rejects(importEcosystemDataset(db.asD1(),actor,{...input,confirm:true,previewId:p.previewId}),/already used/);
 const altered={...input.rows[0],value:{id:'altered'}};altered.sha256=await previewFingerprint(altered.value);
 await assert.rejects(importEcosystemDataset(db.asD1(),actor,{...input,rows:[altered]}),/key changed/);
 assert.equal(canonicalJson({b:1,a:2}),'{"a":2,"b":1}');
 }finally{db.sqlite.close();}
});
test('MCP checks operator, scopes, tenant and confirmation over the actual SDK transport',async()=>{
 const {McpServer}=await import('@modelcontextprotocol/sdk/server/mcp.js');const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');const {InMemoryTransport}=await import('@modelcontextprotocol/sdk/inMemory.js');const {registerEcosystemDatasetTools}=await import('../src/ecosystemPublicMcp');
 const db=setup();const input=await fixture();
 async function call(identity:{userId:string;scopes:string[];isOperator:boolean},args:unknown,tenant='test-org',name='preview_ecosystem_dataset'){
  const server=new McpServer({name:'test',version:'1'});registerEcosystemDatasetTools(server,db.asD1(),identity,tenant);
  const client=new Client({name:'test',version:'1'});const[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
  try{return await client.callTool({name,arguments:args as Record<string,unknown>});}finally{await client.close();await server.close();}
 }
 try{
 const full={userId:actor.id,scopes:['org:portal.read','org:portal.write'],isOperator:true};
 for(const identity of [{...full,scopes:['org:portal.read']},{...full,isOperator:false}])assert.equal((await call(identity,input)).isError,true);
 assert.equal((await call(full,input,'different-tenant')).isError,true);assert.equal((await call(full,input)).isError,undefined);
 assert.equal((await call(full,input,'test-org','apply_ecosystem_dataset')).isError,true);
 }finally{db.sqlite.close();}
});

test('portal snapshot aliases never duplicate their native non-fiscal support in the master view',async()=>{
 const db=setup();try{
 const native=db.sqlite.prepare('SELECT id FROM organization_support_records LIMIT 1').get()!;
 const input=await fixture({id:'portal:'+native.id});await apply(db,input);await apply(db,{...input,action:'publish',rows:[]});
 assert.equal(db.sqlite.prepare("SELECT count(*) n FROM master_transaction_records WHERE record_type='ecosystem_relationship'").get()!.n,0);
 assert.equal(db.sqlite.prepare("SELECT count(*) n FROM master_transaction_records WHERE record_id=?").get(native.id)!.n,1);
 assert.equal((await publicEcosystemRecords(db.asD1(),'relationships')).records.length,1);
 }finally{db.sqlite.close();}
});
