import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { TimebankDatabase } from './helpers/timebankDatabase';
import { organizationSupport, publicRelationshipRecords, runSupportOperation, runSupportMcp } from '../src/organizationSupport';
import { EventIntegrationError } from '../src/eventPlatforms';
import { OrganizationIamError, type OrganizationActor } from '../src/organizationIam';
const actor: OrganizationActor = { id: 'manager', name: 'Manager', email: null, isOperator: false };
function setup() {
  const db = new TimebankDatabase();
  for (const migration of ['0002_org_event_directories.sql','0015_organization_iam.sql','0017_event_mcp_operations.sql','0057_organization_support.sql','0043_organization_media.sql','0061_organization_replication.sql','0065_financing_records.sql'])
    db.sqlite.exec(readFileSync(new URL(`../migrations/${migration}`,import.meta.url),'utf8'));
  for (const id of ['a','b','c','d']) {
    db.sqlite.prepare('INSERT INTO organizations (id,name,slug) VALUES (?,?,?)').run(id,`Organization ${id}`,`org-${id}`);
    db.sqlite.prepare("INSERT INTO organization_memberships (organization_id,user_id,role,status,created_at,updated_at) VALUES (?,?,'administrator','active',?,?)")
      .run(id,actor.id,'2026-10-04','2026-10-04');
  }
  return db;
}
const contribution = (from='a',to='b') => ({ organizationId: from, recipientOrganizationId: to, supportKind: 'transfer', amount: 100, currency: 'USD',
  description: 'Documented grant', occurredAt: '2026-10-04', sourceUrl: 'https://example.test/grant', evidence: 'Award announcement' });
const errorStatus = (status:number) => (error:unknown) => (error instanceof EventIntegrationError || error instanceof OrganizationIamError) && error.status===status;
test('bulk public relationships paginate published support records without mixing ledger record types', async () => {
  const db=setup();
  assert.ok(Number(db.sqlite.prepare("SELECT count(*) n FROM master_transaction_records WHERE record_type='ledger'").get()!.n)>0);
  const insert=db.sqlite.prepare(`INSERT INTO organization_support_records(id,from_label,to_label,support_kind,description,source_url,created_at)
    VALUES(?,'Funder','Recipient','collaboration','Public evidence','https://example.test','2026-10-06')`);
  for(let i=0;i<503;i++)insert.run(String(i).padStart(4,'0'));
  const first=await publicRelationshipRecords(db.asD1());
  assert.equal(first.records.length,500);assert.equal(first.nextRecordOffset,500);
  const last=await publicRelationshipRecords(db.asD1(),500);
  assert.equal(last.records.length,3);assert.equal(last.nextRecordOffset,null);
  const rows=[...first.records,...last.records];
  assert.equal(new Set(rows.map(row=>row.id)).size,503);
  assert.ok(rows.every(row=>row.record_type==='organization_support'));
  db.sqlite.close();
});
async function record(sqlite:TimebankDatabase,input:Record<string,unknown>) {
  const preview = await runSupportOperation(sqlite.asD1(),actor,'record',input);
  return runSupportOperation(sqlite.asD1(),actor,'record',{...input,previewId:preview.previewId,confirm:true});
}

test('writes require matching one-use receipts and live management permission',async()=>{
  const sqlite=setup(),db=sqlite.asD1(),input=contribution();
  await assert.rejects(()=>runSupportOperation(db,actor,'record',{...input,confirm:true}),errorStatus(409));
  const preview=await runSupportOperation(db,actor,'record',input);
  assert.equal(sqlite.sqlite.prepare('SELECT count(*) n FROM organization_support_records').get()!.n,0);
  const apply={...input,previewId:preview.previewId,confirm:true};
  await assert.rejects(()=>runSupportOperation(db,actor,'record',{...apply,amount:101}),errorStatus(409));
  await assert.rejects(()=>runSupportOperation(db,{...actor,id:'outsider'},'record',apply),errorStatus(403));
  sqlite.sqlite.exec("UPDATE organization_memberships SET status='inactive' WHERE organization_id='a'");
  await assert.rejects(()=>runSupportOperation(db,actor,'record',apply),errorStatus(403));
  sqlite.sqlite.exec("UPDATE organization_memberships SET status='active' WHERE organization_id='a'");
  const results=await Promise.allSettled([runSupportOperation(db,actor,'record',apply),runSupportOperation(db,actor,'record',apply)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  await assert.rejects(()=>runSupportOperation(db,actor,'record',apply),errorStatus(409));
  assert.equal(sqlite.sqlite.prepare('SELECT count(*) n FROM organization_support_records').get()!.n,1);
  assert.equal(sqlite.sqlite.prepare('SELECT count(*) n FROM audit_events').get()!.n,1);
  sqlite.sqlite.close();
});
test('expired and other-actor receipts cannot be used by another authorized manager',async()=>{
  const sqlite=setup(),db=sqlite.asD1();
  const preview=await runSupportOperation(db,actor,'record',contribution());
  sqlite.sqlite.exec("INSERT INTO organization_memberships (organization_id,user_id,role,status,created_at,updated_at) VALUES ('a','other','administrator','active','now','now')");
  const apply={...contribution(),confirm:true,previewId:preview.previewId};
  await assert.rejects(()=>runSupportOperation(db,{...actor,id:'other'},'record',apply),errorStatus(409));
  sqlite.sqlite.prepare('UPDATE event_mcp_operations SET expires_at=0 WHERE id=?').run(preview.previewId!);
  await assert.rejects(()=>runSupportOperation(db,actor,'record',apply),errorStatus(409));
  sqlite.sqlite.close();
});
test('descendants include nonmonetary and indirect support, tolerate cycles, and exclude contextual scopes',async()=>{
  const sqlite=setup();
  await record(sqlite,contribution());
  await record(sqlite,{...contribution('b','c'),supportKind:'mentoring',amount:null,currency:null,quantity:12,unit:'hours'});
  await record(sqlite,contribution('c','a'));
  for(const supportKind of ['terms','portfolio','coinvestment']) await record(sqlite,{...contribution('a','d'),supportKind});
  const support=await organizationSupport(sqlite.asD1(),'org-a');
  assert.deepEqual(support.descendants.map(row=>[row.id,row.is_direct]),[['b',1],['c',0]]);
  assert.deepEqual(support.supporters.map(row=>row.id),['c']);
  const mentoring=sqlite.sqlite.prepare("SELECT * FROM master_transaction_records WHERE transaction_type='mentoring'").get()!;
  assert.equal(mentoring.amount,null);assert.equal(mentoring.currency,null);assert.equal(mentoring.quantity,12);assert.equal(mentoring.unit,'hours');
  assert.equal(sqlite.sqlite.prepare("SELECT balance FROM ledger_accounts WHERE id='acct-alice'").get()!.balance,1200);
  assert.equal(sqlite.sqlite.prepare('SELECT count(*) n FROM ledger_transactions').get()!.n,4);
  sqlite.sqlite.close();
});
test('voiding retains evidence and audit history and removes unsupported descendants',async()=>{
  const sqlite=setup(),db=sqlite.asD1();
  const created=await record(sqlite,contribution());assert.ok('recordId' in created);
  const input={organizationId:'a',recordId:created.recordId,reason:'Duplicate; grant withdrawn'};
  await assert.rejects(()=>runSupportOperation(db,actor,'void',{...input,organizationId:'b'}),errorStatus(404));
  const preview=await runSupportOperation(db,actor,'void',input);
  await runSupportOperation(db,actor,'void',{...input,confirm:true,previewId:preview.previewId});
  assert.deepEqual((await organizationSupport(db,'a')).descendants,[]);
  assert.equal(sqlite.sqlite.prepare('SELECT status FROM master_transaction_records WHERE record_id=?').get(created.recordId!)!.status,'voided');
  assert.equal(sqlite.sqlite.prepare('SELECT void_reason FROM organization_support_records WHERE id=?').get(created.recordId!)!.void_reason,input.reason);
  assert.equal(sqlite.sqlite.prepare('SELECT count(*) n FROM audit_events').get()!.n,2);
  sqlite.sqlite.close();
});
test('validation prevents self-support, unknown recipients, unsafe sources, and inconsistent units',async()=>{
  const sqlite=setup(),db=sqlite.asD1();
  for(const changes of [{recipientOrganizationId:'a'},{currency:null},{quantity:2},{amount:0},{amount:-1},{sourceUrl:'javascript:alert(1)'},{supportKind:'mentoring'}])
    await assert.rejects(()=>runSupportOperation(db,actor,'record',{...contribution(),...changes}),errorStatus(400));
  await assert.rejects(()=>runSupportOperation(db,actor,'record',{...contribution(),recipientOrganizationId:'unknown'}),errorStatus(404));
  sqlite.sqlite.close();
});
test('MCP scopes do not replace organization permissions or receipts',async()=>{
  const sqlite=setup(),db=sqlite.asD1();
  await assert.rejects(()=>runSupportMcp(db,{userId:actor.id,scopes:[]},'list',{organizationId:'a'}),errorStatus(403));
  await assert.rejects(()=>runSupportMcp(db,{userId:actor.id,scopes:['org:portal.read']},'record',contribution()),errorStatus(403));
  await assert.rejects(()=>runSupportMcp(db,{userId:'outsider',scopes:['org:portal.read','org:portal.write']},'record',contribution()),errorStatus(403));
  await assert.rejects(()=>runSupportMcp(db,{userId:actor.id,scopes:['org:portal.read','org:portal.write']},'record',{...contribution(),confirm:true}),errorStatus(409));
  sqlite.sqlite.close();
});
test('a failing audit insertion rolls back the contribution',async()=>{
  const sqlite=setup(),db=sqlite.asD1();const preview=await runSupportOperation(db,actor,'record',contribution());
  sqlite.sqlite.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'audit failure'); END");
  await assert.rejects(()=>runSupportOperation(db,actor,'record',{...contribution(),confirm:true,previewId:preview.previewId}),/audit failure/);
  assert.equal(sqlite.sqlite.prepare('SELECT count(*) n FROM organization_support_records').get()!.n,0);
  sqlite.sqlite.close();
});
test('MedTech import preserves distinct identities, deduplicated evidence, and unresolved scopes',async()=>{
  const sqlite=setup();const migration=readFileSync(new URL('../migrations/0058_medtech_ecosystem_support.sql',import.meta.url),'utf8');
  sqlite.sqlite.exec(migration);sqlite.sqlite.exec(migration);
  assert.equal(sqlite.sqlite.prepare('SELECT count(*) n FROM organization_source_identities').get()!.n,69);
  assert.equal(sqlite.sqlite.prepare('SELECT count(*) n FROM organization_support_records').get()!.n,51);
  assert.equal(sqlite.sqlite.prepare('SELECT count(*) n FROM organization_support_edges').get()!.n,15);
  const grant=sqlite.sqlite.prepare("SELECT * FROM organization_support_records WHERE from_label='Stephen & Renee Bisciotti Foundation' AND to_label='Blackbird Laboratories'").all();
  assert.equal(grant.length,1);assert.equal(JSON.parse(String(grant[0].provenance_json)).length,2);
  assert.equal(grant[0].amount,100000000);assert.equal(grant[0].currency,'USD');assert.equal(grant[0].status,'reported');
  const generic=sqlite.sqlite.prepare("SELECT * FROM organization_support_records WHERE to_label='Blackbird research + infrastructure'").get()!;
  assert.equal(generic.to_organization_id,null);assert.equal(generic.support_kind,'portfolio');
  const names=sqlite.sqlite.prepare("SELECT id FROM organizations WHERE name LIKE '%Pava%' OR name LIKE '%Hexcite%' OR name LIKE '%FastForward%' OR name LIKE '%Technology Ventures%'").all();
  assert.equal(new Set(names.map(row=>row.id)).size,4);
  sqlite.sqlite.close();
});
test('support migrations apply after the full existing migration sequence',()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');const directory=new URL('../migrations/',import.meta.url);
  for(const name of readdirSync(directory).filter(name=>name.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(name,directory),'utf8'));
  assert.equal(db.prepare('SELECT count(*) n FROM master_transaction_records').get()!.n,
    Number(db.prepare('SELECT count(*) n FROM ledger_transactions').get()!.n) + Number(db.prepare('SELECT count(*) n FROM organization_support_records').get()!.n));
  db.close();
});

test('canonical organization totals separate direction, currency, delivery and unknown amounts', async () => {
  const sqlite = setup();
  await record(sqlite, { ...contribution(), status: 'delivered' });
  await record(sqlite, { ...contribution(), currency: 'EUR', amount: 25 });
  await record(sqlite, { ...contribution('b', 'a'), amount: null, currency: null });
  await record(sqlite, { ...contribution(), supportKind: 'portfolio', amount: 9000 });
  const voided = await record(sqlite, contribution());
  await runSupportOperation(sqlite.asD1(), actor, 'void', { organizationId: 'a', recordId: voided.recordId, reason: 'Duplicate' }).then(preview => runSupportOperation(sqlite.asD1(), actor, 'void', { organizationId: 'a', recordId: voided.recordId, reason: 'Duplicate', previewId: preview.previewId, confirm: true }));
  const result = await organizationSupport(sqlite.asD1(), 'a', 500);
  assert.equal(result.records.length, 0);
  assert.equal(result.financialTotals.source, 'master_transaction_records');
  assert.deepEqual(result.financialTotals.entries.map(row => ({ ...row })), [
    { direction: 'deployed', currency: 'EUR', status: 'reported', amount: 25, recordCount: 1, undisclosedCount: 0, lowerBoundCount: 0 },
    { direction: 'deployed', currency: 'USD', status: 'delivered', amount: 100, recordCount: 1, undisclosedCount: 0, lowerBoundCount: 0 },
    { direction: 'received', currency: null, status: 'reported', amount: null, recordCount: 1, undisclosedCount: 1, lowerBoundCount: 0 },
  ]);
  sqlite.sqlite.close();
});
