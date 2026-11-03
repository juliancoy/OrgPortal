import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {TimebankDatabase} from './helpers/timebankDatabase';
import {importMarylandComptroller,marylandComptrollerStatus} from '../src/marylandComptroller';
function setup(){
 const db=Object.create(TimebankDatabase.prototype) as TimebankDatabase;
 Object.defineProperty(db,'sqlite',{value:new DatabaseSync(':memory:')});
 db.sqlite.exec('PRAGMA foreign_keys=ON');
 const directory=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(directory).filter(n=>n.endsWith('.sql')).sort())db.sqlite.exec(readFileSync(new URL(name,directory),'utf8'));
 db.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('comptroller-test','Test source','comptroller-test')");
 return db;
}
const actor={id:'test-operator',name:'Operator',email:null,isOperator:true};
const row={id:'md-view:'+'a'.repeat(64),dataset:'mdview',external_id:'0000123',agency_label:'Agency A',recipient_label:'Unregistered payee',occurred_at:'2026-10-01',amount_cents:12345,fact_type:'disbursement',description:'Public payment total',source_url:'https://interactive2.marylandtaxes.gov/MDVIEW/Home/PaymentSearch',metadata:{agency_code:'000',payment_number:'0000123'},retrieved_at:'2026-11-02T12:00:00Z',source_sha256:'b'.repeat(64)};
const input={organizationId:'comptroller-test',rows:[row]};
async function apply(db:TimebankDatabase,payload=input){const p=await importMarylandComptroller(db.asD1(),actor,payload);return importMarylandComptroller(db.asD1(),actor,{...payload,confirm:true,previewId:p.previewId});}
test('full migration chain preserves old transactions and signed observations without settlement or identity inference',async()=>{
 const db=setup();try{
 const count=db.sqlite.prepare('SELECT count(*) n FROM master_transaction_records').get()!.n;
 const ledger=db.sqlite.prepare('SELECT count(*) n FROM ledger_transactions').get()!.n;
 const bpw={...row,id:'md-bpw:'+'c'.repeat(64),dataset:'bpw',fact_type:'reported_award',amount_cents:-500,source_url:'https://bpw.maryland.gov/MeetingDocs/2026-Sep-16-Agenda.pdf'};
 const p=await importMarylandComptroller(db.asD1(),actor,{...input,rows:[row,bpw]});
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM external_financial_observations').get()!.n,0);
 await importMarylandComptroller(db.asD1(),actor,{...input,rows:[row,bpw],confirm:true,previewId:p.previewId});
 const entries=db.sqlite.prepare("SELECT * FROM master_transaction_records WHERE record_type='external_financial_observation' ORDER BY amount").all();
 assert.equal(entries[0].amount,-5);assert.equal(entries[1].amount,123.45);
 assert.equal(entries[0].financial_fact_type,'reported_award');assert.equal(entries[1].financial_fact_type,'disbursement');
 assert.equal(entries[1].to_organization_id,null);assert.equal(entries[1].status,'reported');assert.equal(entries[1].award_identifier,'0000123');
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM master_transaction_records').get()!.n,Number(count)+2);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM ledger_transactions').get()!.n,ledger);
 const status=await marylandComptrollerStatus(db.asD1(),actor,'comptroller-test');
 assert.ok('totals' in status);assert.equal(status.totals.length,2);
 await assert.rejects(marylandComptrollerStatus(db.asD1(),{...actor,isOperator:false},'comptroller-test'));
 await apply(db);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM external_financial_observations').get()!.n,2);
 await assert.rejects(apply(db,{...input,rows:[{...row,amount_cents:100}]}),/correction/);
 }finally{db.sqlite.close();}
});
test('operator authorization, exact one-use receipts, source types, and rollback are enforced',async()=>{
 const db=setup();try{
 await assert.rejects(importMarylandComptroller(db.asD1(),{...actor,isOperator:false},input),/Operator/);
 await assert.rejects(importMarylandComptroller(db.asD1(),actor,{...input,rows:[{...row,source_url:'https://example.com'}]}),/Invalid/);
 await assert.rejects(importMarylandComptroller(db.asD1(),actor,{...input,rows:[{...row,fact_type:'reported_award'}]}),/Invalid/);
 await assert.rejects(importMarylandComptroller(db.asD1(),actor,{...input,rows:[row,row]}),/Duplicate/);
 await assert.rejects(importMarylandComptroller(db.asD1(),actor,{...input,confirm:true}),/preview/);
 const p=await importMarylandComptroller(db.asD1(),actor,input);
 const confirmed={...input,confirm:true,previewId:p.previewId};
 await assert.rejects(importMarylandComptroller(db.asD1(),{...actor,id:'other'},confirmed));
 await assert.rejects(importMarylandComptroller(db.asD1(),actor,{...confirmed,rows:[{...row,amount_cents:200}]}));
 db.sqlite.exec("CREATE TRIGGER fail_comptroller_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
 await assert.rejects(importMarylandComptroller(db.asD1(),actor,confirmed));
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM external_financial_observations').get()!.n,0);
 db.sqlite.exec('DROP TRIGGER fail_comptroller_audit');
 const fresh=await importMarylandComptroller(db.asD1(),actor,input);const applied={...input,confirm:true,previewId:fresh.previewId};
 await importMarylandComptroller(db.asD1(),actor,applied);
 await assert.rejects(importMarylandComptroller(db.asD1(),actor,applied));
 }finally{db.sqlite.close();}
});

test('shared schema supports another provider, currency and nested JSON without a migration',()=>{
 const db=setup();try{
 db.sqlite.prepare(`INSERT INTO external_financial_observations(id,source_system,dataset,external_id,agency_label,recipient_label,occurred_at,
 amount_cents,currency,measurement,fact_type,description,source_url,metadata_json,retrieved_at,source_sha256)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('other:1','other_government','grants','G-1','Agency B','Recipient B','2026-01-01',500,'EUR','cumulative','obligation','Other grant','https://example.test/grants/1',JSON.stringify({award:{category:'research'}}),'2026-11-02T00:00:00Z','d'.repeat(64));
 const result=db.sqlite.prepare("SELECT * FROM master_transaction_records WHERE record_id='other:1'").get()!;
 assert.equal(result.currency,'EUR');assert.equal(result.amount,5);assert.equal(result.financial_measurement,'cumulative');
 assert.equal(result.evidence,'other_government');assert.equal(result.fiscal_year_basis,null);
 assert.deepEqual(JSON.parse(result.provenance_json as string),{award:{category:'research'}});
 }finally{db.sqlite.close();}
});
