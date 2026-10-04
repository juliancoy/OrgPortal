import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { TimebankDatabase } from './helpers/timebankDatabase';
import { runOrganizationRegistryOperation as run } from '../src/organizationRegistry';
import { type OrganizationActor } from '../src/organizationIam';
const actor: OrganizationActor={id:'operator',name:'Operator',email:null,isOperator:true};
const input={name:'Example Venture',description:'Named cohort participant',sourceUrl:'https://example.test/cohort',tags:['LifeTech']};
function setup() {
 const db=new TimebankDatabase();
 for(const migration of ['0002_org_event_directories.sql','0015_organization_iam.sql','0017_event_mcp_operations.sql'])
  db.sqlite.exec(readFileSync(new URL(`../migrations/${migration}`,import.meta.url),'utf8'));
 return db;
}
test('operator registers evidence without ownership and cannot replay receipts',async()=>{
 const db=setup();
 try {
  const preview=await run(db.asD1(),actor,input);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM organizations').get()!.n,0);
  const applied=await run(db.asD1(),actor,{...input,confirm:true,previewId:preview.previewId});
  assert.ok('organizationId' in applied);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM organizations').get()!.n,1);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM organization_ownerships').get()!.n,0);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM organization_memberships').get()!.n,0);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM audit_events').get()!.n,1);
  assert.equal(db.sqlite.prepare('SELECT city FROM organizations').get()!.city,null);
  await assert.rejects(()=>run(db.asD1(),actor,{...input,confirm:true,previewId:preview.previewId}));
 } finally {db.sqlite.close();}
});
test('registry rejects nonoperators and changed or expired receipts',async()=>{
 const db=setup();
 try {
  await assert.rejects(()=>run(db.asD1(),{...actor,isOperator:false},input));
  await assert.rejects(()=>run(db.asD1(),actor,{...input,confirm:true}));
  const preview=await run(db.asD1(),actor,input);
  await assert.rejects(()=>run(db.asD1(),actor,{...input,name:'Other venture',confirm:true,previewId:preview.previewId}));
  db.sqlite.prepare('UPDATE event_mcp_operations SET expires_at=0 WHERE id=?').run(preview.previewId!);
  await assert.rejects(()=>run(db.asD1(),actor,{...input,confirm:true,previewId:preview.previewId}));
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM organizations').get()!.n,0);
 } finally {db.sqlite.close();}
});
test('registration rejects existing name or website',async()=>{
 const db=setup();
 try {
  db.sqlite.prepare('INSERT INTO organizations(id,name,slug,source_url) VALUES (?,?,?,?)').run('existing','Existing Venture','existing','https://existing.test/');
  await assert.rejects(()=>run(db.asD1(),actor,{...input,name:'Existing Venture'}));
  await assert.rejects(()=>run(db.asD1(),actor,{...input,website:'https://existing.test/'}));
 } finally {db.sqlite.close();}
});
