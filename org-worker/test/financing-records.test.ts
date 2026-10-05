import { organizationFunding } from '../src/organizationFunding';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {TimebankDatabase} from './helpers/timebankDatabase';
import {importFinancing,financingAgencyReport,financingRecipientReport} from '../src/financingRecords';
import {organizationSnapshot,replicateOrganizations,replicaStatus} from '../src/organizationReplication';
const actor={id:'operator',name:'Operator',email:null,isOperator:true};
function setup(){const db=new TimebankDatabase();for(const file of ['0002_org_event_directories.sql','0043_organization_media.sql','0015_organization_iam.sql','0017_event_mcp_operations.sql','0057_organization_support.sql','0061_organization_replication.sql','0065_financing_records.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));db.sqlite.exec("CREATE TABLE organization_source_identities(organization_id TEXT); INSERT INTO organizations(id,name,slug) VALUES('tedco','TEDCO','tedco'),('other','Other','other')");return db;}
const recipient={key:'pixee',name:'Pixee',organizationId:null,metadata:{status:{value:'operating'}},research:{key:'pixee',name:'Pixee',tags:[]},audit:{key:'pixee',name:'Pixee',priority:1,status:'partial',candidateSources:[{title:'Company seed announcement',url:'https://example.test/seed'},{title:'Pending research',url:'https://example.test/pending'}]}};
const round={id:'pixee-seed-2025',companyKey:'pixee',announcedAt:'2025-05-22',label:'Seed',type:'equity',amountUsd:15000000,amountQualifier:'exact',investors:['TEDCO'],sourceUrls:['https://example.test/seed'],notes:'Includes TEDCO contribution'};
const contribution={...round,id:'tedco-pixee-2025',type:'agency',amountUsd:1500000,includedInEventId:round.id};
const input={organizationId:'tedco',reviewedAt:'2026-10-05',recipients:[recipient],events:[contribution,round]};
async function apply(db:TimebankDatabase,value=input){const preview=await importFinancing(db.asD1(),actor,value);return importFinancing(db.asD1(),actor,{...value,confirm:true,previewId:preview.previewId});}
test('agency and recipient views share a transactional store, imports are idempotent and full rounds are distinct from contributions',async()=>{const db=setup();try{
 const p=await importFinancing(db.asD1(),actor,input);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM financing_events').get()!.n,0);await importFinancing(db.asD1(),actor,{...input,confirm:true,previewId:p.previewId});await apply(db);
 assert.equal((await financingAgencyReport(db.asD1(),'tedco')).funding.companies[0].totalUsd,1500000);assert.equal((await financingRecipientReport(db.asD1(),'pixee')).events.length,2);const leads=(await financingAgencyReport(db.asD1(),'tedco')).financing.audit[0].candidateSources;assert.equal(leads[0].outcome,'verified');assert.deepEqual(leads[0].transactionIds,[round.id]);assert.equal(leads[1].outcome,'pending');
 assert.equal(db.sqlite.prepare("SELECT count(*) n FROM master_transaction_records WHERE record_type='company_financing'").get()!.n,2);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM ledger_transactions').get()!.n,4);
 await apply(db,{...input,organizationId:'other',events:[{...contribution,id:'other-pixee',amountUsd:500000}]});assert.equal((await financingAgencyReport(db.asD1(),'other')).funding.companies[0].totalUsd,500000);assert.equal((await financingAgencyReport(db.asD1(),'tedco')).funding.companies[0].totalUsd,1500000);assert.equal(db.sqlite.prepare("SELECT count(*) n FROM financing_events WHERE event_type='equity'").get()!.n,1);
 }finally{db.sqlite.close();}});
test('receipts require operator identity, matching payload and single use; failed audit rolls back financial changes',async()=>{const db=setup();try{
 await assert.rejects(()=>importFinancing(db.asD1(),{...actor,isOperator:false},input));await assert.rejects(()=>importFinancing(db.asD1(),actor,{...input,confirm:true}));const p=await importFinancing(db.asD1(),actor,input),confirmed={...input,confirm:true,previewId:p.previewId};
 await assert.rejects(()=>importFinancing(db.asD1(),{...actor,id:'other-user'},confirmed));await assert.rejects(()=>importFinancing(db.asD1(),actor,{...confirmed,events:[{...round,amountUsd:1}]}));await importFinancing(db.asD1(),actor,confirmed);await assert.rejects(()=>importFinancing(db.asD1(),actor,confirmed));
 const changes={...input,events:[{...round,amountUsd:16000000}]},fresh=await importFinancing(db.asD1(),actor,changes);db.sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");await assert.rejects(()=>importFinancing(db.asD1(),actor,{...changes,confirm:true,previewId:fresh.previewId}));assert.equal(db.sqlite.prepare('SELECT amount FROM financing_events WHERE id=?').get(round.id)!.amount,15000000);
 }finally{db.sqlite.close();}});
test('snapshots converge atomically, failed refresh retains last good financing and reports stale status',async()=>{const primary=setup(),replica=setup();try{
 await apply(primary);const source='https://primary.example/snapshot',env={DB:replica.asD1(),ORGANIZATION_REPLICA_SOURCE:source};await replicateOrganizations(env,async()=>organizationSnapshot(primary.asD1(),new Request(source)));assert.equal((await financingAgencyReport(replica.asD1(),'tedco')).funding.companies[0].totalUsd,1500000);assert.equal((await replicaStatus(env)).financing_count,2);
 await apply(primary,{...input,events:[{...round,amountUsd:17000000},contribution]});replica.sqlite.exec("UPDATE organization_replica_state SET checked_at='2000-01-01'");await replicateOrganizations(env,async()=>organizationSnapshot(primary.asD1(),new Request(source)));assert.equal((await financingRecipientReport(replica.asD1(),'pixee')).events.find(e=>e.type==='equity')!.amountUsd,17000000);
 replica.sqlite.exec("UPDATE organization_replica_state SET checked_at='2000-01-01'");await assert.rejects(()=>replicateOrganizations(env,async()=>new Response('',{status:503})));assert.equal((await financingRecipientReport(replica.asD1(),'pixee')).events.length,2);assert.equal((await replicaStatus(env)).stale,true);
 }finally{primary.sqlite.close();replica.sqlite.close();}});

 test('counterparty charts allocate named agency contributions within rounds and include unregistered recipients', async () => {
 const db=setup(); try {
 await apply(db,{...input,recipients:[{...recipient,organizationId:'other'}]});
 const agency=await organizationFunding(db.asD1(),'tedco');
 assert.equal(agency.counterparties[0].name,'Pixee');
 assert.equal(agency.entries[0].amount,1500000);
 const received=await organizationFunding(db.asD1(),'other');
 assert.equal(received.entries[0].amount,15000000);
 assert.deepEqual(received.counterparties.map(row=>[row.name,row.amount]),[['Multiple investors',13500000],['TEDCO',1500000]]);
 await apply(db,{...input,recipients:[recipient]});
 const unregistered=await organizationFunding(db.asD1(),'tedco');
 assert.equal(unregistered.counterparties[0].slug,null);
 assert.equal(unregistered.counterparties[0].counterpartKey,'pixee');
 } finally { db.sqlite.close(); }
 });
