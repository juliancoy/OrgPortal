import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {TimebankDatabase} from './helpers/timebankDatabase';
import {importUsaspending,usaspendingStatus} from '../src/usaspending';
function setup(){
 const db=Object.create(TimebankDatabase.prototype) as TimebankDatabase;
 Object.defineProperty(db,'sqlite',{value:new DatabaseSync(':memory:')});db.sqlite.exec('PRAGMA foreign_keys=ON');
 const dir=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())db.sqlite.exec(readFileSync(new URL(name,dir),'utf8'));
 db.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('federal-test','Test source','federal-test')");return db;
}
const actor={id:'test-operator',name:'Operator',email:null,isOperator:true};
const sourceKey='CONT_TX_0001';
const row={id:'usaspending:transaction:'+createHash('sha256').update(sourceKey).digest('hex'),dataset:'prime_transactions',external_id:sourceKey,
 agency_label:'Federal agency',recipient_label:'Reported recipient',occurred_at:'2024-10-01',amount_cents:-12345,fact_type:'obligation',description:'Signed federal action obligation',
 source_url:'https://www.usaspending.gov/award/CONT_AWD_0001/',retrieved_at:'2026-11-23T00:00:00Z',source_sha256:'b'.repeat(64),metadata:{
 transaction_key:sourceKey,award_key:'CONT_AWD_0001',award_identifier:'0001',fiscal_year:'2025',awarding_agency_code:'069',awarding_sub_agency_code:'6925',
 awarding_sub_agency_name:'Federal subagency',funding_agency_code:'069',funding_agency_name:'Federal agency',recipient_uei:'ABCDEFGHIJKL',
 recipient_state_code:'DC',recipient_country_code:'USA',primary_place_of_performance_state_code:'MD',primary_place_of_performance_country_code:'USA',
 modification_number:'0',assistance_type:'',award_type:'A'}};
const input={organizationId:'federal-test',rows:[row]};
test('federal transactions enter the master record as signed obligations; replay is idempotent and corrections stop',async()=>{
 const db=setup();try{
 const ledger=db.sqlite.prepare('SELECT count(*) n FROM ledger_transactions').get()!.n;
 const p=await importUsaspending(db.asD1(),actor,input);
 assert.ok('review' in p);assert.equal('changes' in p,false);
 assert.deepEqual(p.review.totals,[{fiscal_year:'2025',records:1,amount_cents:-12345}]);
 assert.deepEqual(p.review.sourceHashes,['b'.repeat(64)]);assert.equal(p.review.firstId,row.id);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM external_financial_observations').get()!.n,0);
 await importUsaspending(db.asD1(),actor,{...input,confirm:true,previewId:p.previewId});
 const entry=db.sqlite.prepare('SELECT * FROM master_transaction_records WHERE id=?').get(row.id)!;
 assert.equal(entry.amount,-123.45);assert.equal(entry.financial_fact_type,'obligation');assert.equal(entry.financial_measurement,'delta');
 assert.equal(entry.to_organization_id,null);assert.equal(entry.evidence,'usaspending');
 assert.equal(JSON.parse(String(entry.provenance_json)).fiscal_year,'2025');
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM ledger_transactions').get()!.n,ledger);
 const again=await importUsaspending(db.asD1(),actor,input);
 const result=await importUsaspending(db.asD1(),actor,{...input,confirm:true,previewId:again.previewId});assert.equal(result.existing,1);assert.equal(result.recorded,0);
 await assert.rejects(importUsaspending(db.asD1(),actor,{...input,rows:[{...row,amount_cents:999}]}),/correction/);
 const status=await usaspendingStatus(db.asD1(),actor,input.organizationId);
 assert.ok('totals' in status);assert.equal(status.totals[0].fiscal_year,'2025');assert.equal(status.totals[0].amount_cents,-12345);
 }finally{db.sqlite.close();}
});
test('source identity, geography, facts, permissions, receipts and atomic rollback are enforced',async()=>{
 const db=setup();try{
 await assert.rejects(importUsaspending(db.asD1(),{...actor,isOperator:false},input),/Operator/);
 for(const bad of [{...row,fact_type:'disbursement'},{...row,source_url:'https://evil.test/award/CONT_AWD_0001/'},
  {...row,id:'usaspending:transaction:'+'c'.repeat(64)}, {...row,metadata:{...row.metadata,fiscal_year:'2024'}},
  {...row,metadata:{...row.metadata,primary_place_of_performance_state_code:'VA'}},
  {...row,metadata:{...row.metadata,street_address:'not allowed'}}])await assert.rejects(importUsaspending(db.asD1(),actor,{...input,rows:[bad]}));
 await assert.rejects(importUsaspending(db.asD1(),actor,{...input,rows:[row,row]}),/Duplicate/);
 const p=await importUsaspending(db.asD1(),actor,input),confirmed={...input,confirm:true,previewId:p.previewId};
 await assert.rejects(importUsaspending(db.asD1(),{...actor,id:'other'},confirmed));
 await assert.rejects(importUsaspending(db.asD1(),actor,{...confirmed,rows:[{...row,amount_cents:200}]}));
 db.sqlite.exec("CREATE TRIGGER fail_federal_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
 await assert.rejects(importUsaspending(db.asD1(),actor,confirmed));
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM external_financial_observations').get()!.n,0);
 }finally{db.sqlite.close();}
});
test('MCP applies only within live scopes, tenant and operator grant, with an exact one-use receipt',async()=>{
 const {McpServer}=await import('@modelcontextprotocol/sdk/server/mcp.js');const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');
 const {InMemoryTransport}=await import('@modelcontextprotocol/sdk/inMemory.js');const {registerUsaspendingTools}=await import('../src/usaspendingMcp');
 const db=setup();
 async function connect(identity:{userId:string;scopes:string[];isOperator:boolean},tenant='federal-test'){
  const server=new McpServer({name:'test',version:'1'});registerUsaspendingTools(server,db.asD1(),identity,tenant);
  const client=new Client({name:'test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
  return {client,close:async()=>{await client.close();await server.close();}};
 }
 try{
  for(const [scopes,operator,tenant] of [[['org:portal.read'],true,'federal-test'],[['org:portal.read','org:portal.write'],false,'federal-test'],[['org:portal.read','org:portal.write'],true,'other']] as const){
   const c=await connect({userId:actor.id,scopes:[...scopes],isOperator:operator},tenant);
   try{assert.equal((await c.client.callTool({name:'preview_usaspending_import',arguments:input})).isError,true);}finally{await c.close();}
  }
  const identity={userId:actor.id,scopes:['org:portal.read','org:portal.write'],isOperator:true},c=await connect(identity);
  try{
   const preview=await c.client.callTool({name:'preview_usaspending_import',arguments:input});assert.ok(!preview.isError);
   assert.ok(JSON.stringify(preview).length<4000,'MCP preview stays compact instead of echoing submitted source rows');
   const payload={...input,previewId:preview.structuredContent!.previewId,confirm:true};
   identity.isOperator=false;assert.equal((await c.client.callTool({name:'apply_usaspending_import',arguments:payload})).isError,true);
   identity.isOperator=true;assert.ok(!(await c.client.callTool({name:'apply_usaspending_import',arguments:payload})).isError);
   assert.equal((await c.client.callTool({name:'apply_usaspending_import',arguments:payload})).isError,true);
  }finally{await c.close();}
 }finally{db.sqlite.close();}
});

// Dates, not source JSON text, determine the validated federal fiscal year.
test('status reconciles fiscal-year boundaries and signed totals without sorting source metadata',async()=>{
 const db=setup();try{
 const dates=['2000-09-30','2000-10-01','2024-09-30','2024-10-01','2025-09-30','2025-10-01'];
 const rows=dates.map((date,i)=>{const key='BOUNDARY_'+i;return {...row,id:'usaspending:transaction:'+createHash('sha256').update(key).digest('hex'),external_id:key,occurred_at:date,amount_cents:i%2?-500:1200,metadata:{...row.metadata,transaction_key:key,fiscal_year:String(Number(date.slice(0,4))+(date.slice(5,7)>='10'?1:0))}}});
 const input={organizationId:'federal-test',rows};const preview=await importUsaspending(db.asD1(),actor,input);
 await importUsaspending(db.asD1(),actor,{...input,confirm:true,previewId:preview.previewId});
 const expected=db.sqlite.prepare(`SELECT dataset,json_extract(metadata_json,'$.fiscal_year') AS fiscal_year,count(*) AS records,sum(amount_cents) AS amount_cents,min(occurred_at) AS period_start,max(occurred_at) AS period_end FROM external_financial_observations WHERE source_system='usaspending' GROUP BY dataset,json_extract(metadata_json,'$.fiscal_year') ORDER BY dataset,fiscal_year`).all();
 const status=await usaspendingStatus(db.asD1(),actor,input.organizationId);assert.ok('totals' in status);
 assert.deepEqual(status.totals,expected);assert.equal(status.totals.find(r=>r.fiscal_year==='2025')!.amount_cents,700);
 assert.equal(status.sources[0].records,6);
 }finally{db.sqlite.close();}
});
