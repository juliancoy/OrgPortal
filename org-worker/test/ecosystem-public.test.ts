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

test('reviewed archive deletion cascades source copies while active datasets stay protected',async()=>{
 const db=setup();try{
 const first=await fixture();await apply(db,first);await apply(db,{...first,action:'publish',rows:[]});
 await assert.rejects(importEcosystemDataset(db.asD1(),actor,{...first,action:'delete_archived',rows:[]}),/Only superseded/);
 const second=await fixture({description:'Reviewed correction'});await apply(db,second);await apply(db,{...second,action:'publish',rows:[]});
 await apply(db,{...first,action:'delete_archived',rows:[]});
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM ecosystem_public_records WHERE dataset_id=?').get(first.datasetId)!.n,0);
 assert.equal((await publicEcosystemRecords(db.asD1(),'relationships')).datasetId,second.datasetId);
 }finally{db.sqlite.close();}
});

test('explicit federal cumulative obligations normalize to master fact and measurement fields without classifying non-fiscal records',async()=>{
 const db=setup();try{
 const input=await fixture({financialMeasure:'cumulative_obligations',awardKey:'usaspending:TEST',amount:-12,currency:'USD',kind:'transfer'});await apply(db,input);await apply(db,{...input,action:'publish',rows:[]});
 const row=db.sqlite.prepare("SELECT * FROM master_transaction_records WHERE record_type='ecosystem_relationship'").get()!;
 assert.equal(row.financial_fact_type,'obligation');assert.equal(row.financial_measurement,'cumulative');assert.equal(row.financial_scope,'award');assert.equal(row.amount,-12);
 }finally{db.sqlite.close();}
});


test('bounded native export preserves every public master field and cursor across external/native page boundaries',async()=>{
 const db=setup();try{
 const insert=db.sqlite.prepare(`INSERT INTO external_financial_observations
 (id,source_system,dataset,external_id,agency_label,recipient_label,occurred_at,amount_cents,currency,measurement,fact_type,description,source_url,metadata_json,retrieved_at,source_sha256)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
 for(let i=0;i<4201;i++)insert.run(`${i%2?'z':'a'}:export:${String(i).padStart(5,'0')}`,i%3?'usaspending':'maryland_comptroller',i%3?'prime_transactions':'bpw',String(i),'Agency','Recipient','2025-03-01',i%5?-i*100:0,i%7?'USD':'EUR','delta',i%3?'obligation':'reported_award','Source evidence','https://example.test/source',JSON.stringify({fiscal_year:'2025',index:i}),'2026-11-23','a'.repeat(64));
 const expected=db.sqlite.prepare(`SELECT id,record_id,record_type,occurred_at,transaction_type,amount,currency,amount_label,
 quantity,unit,description,from_label,to_label,from_organization_id,to_organization_id,status,source_url,evidence,notes,provenance_json,
 financial_fact_type,financial_measurement,period_start,period_end,award_id,award_identifier
 FROM master_transaction_records_before_ecosystem
 WHERE record_type IN ('organization_support','company_financing','nonprofit_grant','external_financial_observation') ORDER BY id`).all();
 for(const limit of [undefined,2000,317]){
 const actual:Record<string,unknown>[]=[];let after='';
 do{const page=await publicEcosystemNativeRecords(db.asD1(),after,limit);assert.ok(page.records.length<=(limit??500));actual.push(...page.records);if(page.next===null)break;assert.ok(String(page.next)>after);after=String(page.next);}while(true);
 assert.equal(actual.length,expected.length);assert.ok(actual.some(r=>r.record_type==='organization_support'));
 assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)));
 }
 for(const limit of [0,-1,2001,1.5,NaN,Infinity])await assert.rejects(publicEcosystemNativeRecords(db.asD1(),'',limit),/integer from 1 to 2000/);
 assert.deepEqual(await publicEcosystemNativeRecords(db.asD1(),'zzzzzz'),{records:[],next:null});
 }finally{db.sqlite.close();}
});

test('large dataset reconciliation streams ordered hash pages and indexed duplicate checks preserve exact keys',async()=>{
 const db=setup();try{
 const datasetId='d'.repeat(64);db.sqlite.prepare("INSERT INTO ecosystem_public_datasets(id,state,created_at) VALUES(?,'staging','2026-11-24')").run(datasetId);
 const insert=db.sqlite.prepare('INSERT INTO ecosystem_public_records(dataset_id,collection,record_key,payload_json,sha256) VALUES(?,?,?,?,?)');
 const expected:{collection:string;record_key:string;sha256:string}[]=[];
 for(let i=0;i<4107;i++){
  const collection=i%2?'relationships':'organizations';const key=i.toString(16).padStart(64,'0');const sha256='a'.repeat(64);
  insert.run(datasetId,collection,key,JSON.stringify({id:key}),sha256);expected.push({collection,record_key:key,sha256});
 }
 expected.sort((a,b)=>(a.collection+'\t'+a.record_key)<(b.collection+'\t'+b.record_key)?-1:1);
 const bytes=new TextEncoder().encode(expected.map(r=>`${r.collection}\t${r.record_key}\t${r.sha256}\n`).join(''));
 const digest=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
 const original=db.prepare.bind(db);const queries:string[]=[];
 db.prepare=((sql:string)=>{queries.push(sql);return original(sql);}) as typeof db.prepare;
 const status=await ecosystemDatasetStatus(db.asD1(),actor,'test-org',datasetId);assert.ok('digest' in status);
 assert.equal(status.digest,digest);assert.deepEqual(status.counts,[{collection:'organizations',records:2054},{collection:'relationships',records:2053}]);
 const pages=queries.filter(q=>q.includes('SELECT collection,record_key,sha256'));assert.equal(pages.length,3);
 for(const q of pages){assert.match(q,/LIMIT 2000/);assert.doesNotMatch(q,/OFFSET/);}
 const empty=await ecosystemDatasetStatus(db.asD1(),actor,'test-org','f'.repeat(64));assert.ok('digest' in empty);
 assert.equal(empty.digest,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');assert.deepEqual(empty.counts,[]);
 const input=await fixture();await apply(db,input);const replay=await apply(db,input);assert.equal(replay.existing,3);assert.equal(replay.recorded,0);
 const sql=queries.find(q=>q.includes('CROSS JOIN ecosystem_public_records'));assert.ok(sql);
 const plan=db.sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all(JSON.stringify(input.rows.map(r=>[r.collection,r.key])),input.datasetId);
 assert.ok(plan.some(r=>/SEARCH r USING INDEX.*dataset_id=\? AND collection=\? AND record_key=\?/.test(String(r.detail))),JSON.stringify(plan));
 assert.ok(!plan.some(r=>/SCAN r\b/.test(String(r.detail))),JSON.stringify(plan));
 }finally{db.sqlite.close();}
});
