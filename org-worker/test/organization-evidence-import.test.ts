import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { TimebankDatabase } from './helpers/timebankDatabase';
import { evidenceImportSchema, importOrganizationEvidence as run } from '../src/organizationEvidenceImport';
import { organizationSupport } from '../src/organizationSupport';
const actor={id:'operator',name:'Operator',email:null,isOperator:true};
const recipient={key:'company-a',name:'Company A',description:'Publicly documented company.',sourceUrl:'https://example.test/recipients',tags:['TEDCO recipient','LifeTech adjacent'],
  support:{supportKind:'transfer',description:'Published investment recipient',occurredAt:'FY2025',sourceUrl:'https://example.test/recipients',evidence:'Named awardee',notes:'Amount undisclosed; overlapping evidence is not added as a disbursement.'}};
const input={organizationId:'tedco',recipients:[recipient]};
function setup(){
 const db=new TimebankDatabase();
 for(const file of ['0002_org_event_directories.sql','0015_organization_iam.sql','0017_event_mcp_operations.sql','0057_organization_support.sql','0043_organization_media.sql','0061_organization_replication.sql','0065_financing_records.sql','0066_financing_portfolio_tags.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 db.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('tedco','TEDCO','tedco')");
 return db;
}
test('operator previews and atomically registers sourced descendants without identity grants or ledger transfers',async()=>{
 const db=setup();try{
  const preview=await run(db.asD1(),actor,input);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM organizations').get()!.n,1);
  const result=await run(db.asD1(),actor,{...input,confirm:true,previewId:preview.previewId});
  assert.ok('created' in result);assert.equal(result.created,1);
  const support=await organizationSupport(db.asD1(),'tedco');assert.equal(support.descendants.length,1);
  assert.deepEqual(support.descendants[0].tags,['TEDCO recipient','LifeTech adjacent']);
  assert.equal(support.records[0].amount,null);
  for(const table of ['organization_ownerships','organization_memberships'])assert.equal(db.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM ledger_transactions').get()!.n,4);
  await assert.rejects(()=>run(db.asD1(),actor,{...input,confirm:true,previewId:preview.previewId}));
  const repeat=await run(db.asD1(),actor,input);
  const applied=await run(db.asD1(),actor,{...input,confirm:true,previewId:repeat.previewId});
  assert.ok('recorded' in applied);assert.equal(applied.recorded,0);assert.equal(applied.created,0);
 }finally{db.sqlite.close();}
});
test('operator permission, actor binding, payload review and expiry are required',async()=>{
 const db=setup();try{
  await assert.rejects(()=>run(db.asD1(),{...actor,isOperator:false},input));
  await assert.rejects(()=>run(db.asD1(),actor,{...input,confirm:true}));
  const p=await run(db.asD1(),actor,input);
  await assert.rejects(()=>run(db.asD1(),{...actor,id:'other'}, {...input,confirm:true,previewId:p.previewId}));
  await assert.rejects(()=>run(db.asD1(),actor,{...input,recipients:[{...recipient,tags:['Unreviewed']}],confirm:true,previewId:p.previewId}));
  db.sqlite.prepare('UPDATE event_mcp_operations SET expires_at=0 WHERE id=?').run(p.previewId!);
  await assert.rejects(()=>run(db.asD1(),actor,{...input,confirm:true,previewId:p.previewId}));
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM organization_support_records').get()!.n,0);
 }finally{db.sqlite.close();}
});
test('explicit identity matches merge tags and intervening changes invalidate approval',async()=>{
 const db=setup();try{
  db.sqlite.exec(`INSERT INTO organizations(id,name,slug,tags) VALUES('existing','Company A LLC','company-a','["Existing tag"]')`);
  await assert.rejects(()=>run(db.asD1(),actor,{...input,recipients:[{...recipient,name:'Company A LLC'}]}));
  const matched={...input,recipients:[{...recipient,existingOrganizationId:'existing'}]};
  const p=await run(db.asD1(),actor,matched);
  db.sqlite.exec(`UPDATE organizations SET tags='["Changed"]' WHERE id='existing'`);
  await assert.rejects(()=>run(db.asD1(),actor,{...matched,confirm:true,previewId:p.previewId}));
  const p2=await run(db.asD1(),actor,matched);await run(db.asD1(),actor,{...matched,confirm:true,previewId:p2.previewId});
  assert.deepEqual(JSON.parse(String(db.sqlite.prepare('SELECT tags FROM organizations WHERE id=?').get('existing')!.tags)),['Changed','TEDCO recipient','LifeTech adjacent']);
 }finally{db.sqlite.close();}
});
test('a failing audit rolls back the whole import; duplicate and invalid monetary rows are rejected',async()=>{
 const db=setup();try{
  for(const rows of [[recipient,recipient],[{...recipient,support:{...recipient.support,amount:100}}],[{...recipient,support:{...recipient.support,supportKind:'mentoring',amount:100,currency:'USD'}}]])await assert.rejects(()=>run(db.asD1(),actor,{...input,recipients:rows}));
  const p=await run(db.asD1(),actor,input);
  db.sqlite.exec("CREATE TRIGGER reject_import BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  await assert.rejects(()=>run(db.asD1(),actor,{...input,confirm:true,previewId:p.previewId}));
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM organizations').get()!.n,1);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM organization_support_records').get()!.n,0);
 }finally{db.sqlite.close();}
});
test('source evidence is paginated and malformed tags cannot break descendant reads',async()=>{
 const db=setup();try{
  db.sqlite.exec(`INSERT INTO organizations(id,name,slug,tags) VALUES('existing','Company A','company-a','bad json')`);
  const insert=db.sqlite.prepare(`INSERT INTO organization_support_records(id,from_organization_id,to_organization_id,from_label,to_label,support_kind,description,occurred_at,source_url,evidence,status,created_at) VALUES(?,'tedco','existing','TEDCO','Company A','transfer','Award','FY2025','https://example.test','Source','reported','2025-01-01')`);
  for(let i=0;i<501;i++)insert.run(`record-${String(i).padStart(4,'0')}`);
  const first=await organizationSupport(db.asD1(),'tedco');const next=await organizationSupport(db.asD1(),'tedco',first.nextRecordOffset!);
  assert.equal(first.records.length,500);assert.equal(first.recordCount,501);assert.equal(next.records.length,1);assert.equal(next.nextRecordOffset,null);
  assert.deepEqual(first.descendants[0].tags,[]);
  assert.equal(new Set([...first.records,...next.records].map(row=>row.id)).size,501);
 }finally{db.sqlite.close();}
});
test('the full researched TEDCO roster imports with sourced nonmonetary support and existing identities intact',async()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../web/src/data/tedco-recipients.json',import.meta.url),'utf8'));
 const review=JSON.parse(readFileSync(new URL('../../web/src/data/tedco-recipient-review.json',import.meta.url),'utf8'));
 const db=setup();let created=0,recorded=0;
 try{
  db.sqlite.exec("UPDATE organizations SET id='org-tedco' WHERE id='tedco'");
  for(const row of manifest.recipients)if(row.existingOrganizationId)db.sqlite.prepare('INSERT INTO organizations(id,name,slug,tags) VALUES(?,?,?,?)').run(row.existingOrganizationId,row.name,row.key,'["Existing tag"]');
  for(let offset=0;offset<manifest.recipients.length;offset+=25){
   const input={organizationId:'org-tedco',recipients:manifest.recipients.slice(offset,offset+25)};
   assert.ok(evidenceImportSchema.safeParse(input).success,`invalid batch at ${offset}`);
   const preview=await run(db.asD1(),actor,input);const result=await run(db.asD1(),actor,{...input,confirm:true,previewId:preview.previewId});
   assert.ok('created' in result);created+=result.created;recorded+=result.recorded;
  }
  const first=await organizationSupport(db.asD1(),'org-tedco');const second=await organizationSupport(db.asD1(),'org-tedco',first.nextRecordOffset!);
  assert.equal(first.descendants.length,manifest.recipients.length);assert.equal(recorded,manifest.recipients.length);
  assert.equal(created,manifest.recipients.filter((r:{existingOrganizationId:string|null})=>!r.existingOrganizationId).length);
  assert.equal(new Set([...first.records,...second.records].map(r=>r.id)).size,manifest.recipients.length);
  assert.equal(first.descendants.filter(r=>(r.tags as string[]).includes('LifeTech adjacent')).length,review.companies.filter((r:{classification:{adjacent:boolean}})=>r.classification.adjacent).length);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM organization_support_records WHERE support_kind='services'").get()!.n,5);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM organization_support_records WHERE amount IS NOT NULL').get()!.n,0);
  for(const row of manifest.recipients)if(row.existingOrganizationId)assert.ok(JSON.parse(String(db.sqlite.prepare('SELECT tags FROM organizations WHERE id=?').get(row.existingOrganizationId)!.tags)).includes('Existing tag'));
 }finally{db.sqlite.close();}
});
