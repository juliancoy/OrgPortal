import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {TimebankDatabase} from './helpers/timebankDatabase';
import {organizationSnapshot,replicateOrganizations,replicaStatus} from '../src/organizationReplication';
function setup() {
 const db=new TimebankDatabase();
 for(const name of ['0002_org_event_directories.sql','0043_organization_media.sql','0057_organization_support.sql','0061_organization_replication.sql','0065_financing_records.sql','0066_financing_portfolio_tags.sql']) db.sqlite.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
 db.sqlite.exec('CREATE TABLE organization_source_identities (organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT)');
 return db;
}
function insert(db:TimebankDatabase,id:string,name=id) {db.sqlite.prepare('INSERT INTO organizations(id,name,slug) VALUES(?,?,?)').run(id,name,id);}
const source='https://primary.example/api/network/replication/snapshot';
const env=(db:TimebankDatabase)=>({DB:db.asD1(),ORGANIZATION_REPLICA_SOURCE:source});
function expire(db:TimebankDatabase){db.sqlite.exec("UPDATE organization_replica_state SET checked_at='2000-01-01T00:00:00Z'");}
test('snapshot covers every org, excludes identities, ETag unchanged checks transfer no body',async()=>{
 const primary=setup(),local=setup();
 try {
  for(let i=0;i<550;i++)insert(primary,'org-'+i);
  let calls=0;
  const fetcher:typeof fetch=async(u,init)=>{calls++;return organizationSnapshot(primary.asD1(),new Request(u,init));};
  await replicateOrganizations(env(local),fetcher);
  assert.equal(local.sqlite.prepare('SELECT count(*) n FROM organizations').get()!.n,550);
  assert.equal((await replicaStatus(env(local))).stale,false);
  await replicateOrganizations(env(local),fetcher);assert.equal(calls,1);
  expire(local);await replicateOrganizations(env(local),fetcher);assert.equal(calls,2);
  const response=await organizationSnapshot(primary.asD1(),new Request(source));const snapshot=await response.json() as any;
  assert.equal(snapshot.organizations.length,550);assert.ok(!('owner_user_id' in snapshot.organizations[0]));
  const unchanged=await organizationSnapshot(primary.asD1(),new Request(source,{headers:{'If-None-Match':'W/'+response.headers.get('etag')!}}));assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');
 }finally{primary.sqlite.close();local.sqlite.close();}
});
test('updates, additions, deletions converge; failures retain last committed data and expose stale status',async()=>{
 const primary=setup(),local=setup();
 try {
  insert(primary,'tedco','TEDCO');insert(local,'fixture');
  local.sqlite.exec('CREATE TABLE organization_memberships (organization_id TEXT REFERENCES organizations(id), role TEXT, status TEXT, user_name TEXT)');
  local.sqlite.exec(readFileSync(new URL('../migrations/0062_organization_chat.sql',import.meta.url),'utf8'));
  local.sqlite.prepare('INSERT INTO organizations(id,name,slug) VALUES(?,?,?)').run('seeded-tedco','Old seeded TEDCO','tedco');
  local.sqlite.exec("CREATE TABLE seeded_reference (organization_id TEXT REFERENCES organizations(id)); INSERT INTO seeded_reference VALUES('seeded-tedco')");
  const fetcher:typeof fetch=async()=>organizationSnapshot(primary.asD1(),new Request(source));
  await replicateOrganizations(env(local),fetcher);assert.equal(local.sqlite.prepare("SELECT count(*) n FROM organizations WHERE id='fixture'").get()!.n,0);
  assert.deepEqual(local.sqlite.prepare('SELECT organization_id FROM organization_chat_provisioning').all().map(row=>row.organization_id),['tedco']);
  assert.equal(local.sqlite.prepare('SELECT organization_id FROM seeded_reference').get()!.organization_id,'tedco');local.sqlite.exec('DROP TABLE seeded_reference');
  primary.sqlite.prepare("UPDATE organizations SET name='TEDCO updated' WHERE id='tedco'").run();insert(primary,'new');expire(local);await replicateOrganizations(env(local),fetcher);
  assert.equal(local.sqlite.prepare("SELECT name FROM organizations WHERE id='tedco'").get()!.name,'TEDCO updated');
  primary.sqlite.exec("DELETE FROM organizations WHERE id='tedco'");expire(local);await replicateOrganizations(env(local),fetcher);
  assert.equal(local.sqlite.prepare('SELECT count(*) n FROM organizations').get()!.n,1);
  expire(local);await assert.rejects(()=>replicateOrganizations(env(local),async()=>new Response('unavailable',{status:503})));
  assert.equal(local.sqlite.prepare('SELECT count(*) n FROM organizations').get()!.n,1);const status=await replicaStatus(env(local));assert.equal(status.stale,true);assert.match(status.error,/503/);
  await assert.rejects(()=>replicateOrganizations(env(local),async()=>Response.json({version:1,organizations:[],support:null})));
  assert.equal(local.sqlite.prepare('SELECT count(*) n FROM organizations').get()!.n,1);
 }finally{primary.sqlite.close();local.sqlite.close();}
});
test('foreign-key failure rolls back the complete refresh; switching primaries is rejected',async()=>{
 const primary=setup(),local=setup();
 try {
  insert(primary,'old');await replicateOrganizations(env(local),async()=>organizationSnapshot(primary.asD1(),new Request(source)));
  local.sqlite.exec("CREATE TABLE fixture_reference (organization_id TEXT REFERENCES organizations(id)); INSERT INTO fixture_reference VALUES('old')");
  primary.sqlite.exec("DELETE FROM organizations");insert(primary,'new');expire(local);
  await assert.rejects(()=>replicateOrganizations(env(local),async()=>organizationSnapshot(primary.asD1(),new Request(source))));
  assert.deepEqual(local.sqlite.prepare('SELECT id FROM organizations').all().map(x=>x.id),['old']);
  await assert.rejects(()=>replicateOrganizations({...env(local),ORGANIZATION_REPLICA_SOURCE:'https://other.example/snapshot'}));
 }finally{primary.sqlite.close();local.sqlite.close();}
});
test('replicas reject mutations including MCP uploads before identity handlers',async()=>{
 const {app}=await import('../src/index');
 for (const [method,path] of [['POST','/mcp/uploads/organization-media'],['POST','/mcp'],['PATCH','/api/network/orgs/tedco'],['DELETE','/api/network/orgs/tedco'],['POST','/api/onboarding']]) {
  const response=await app.request('https://replica.example'+path,{method}, {ORGANIZATION_REPLICA_SOURCE:source} as Env);
  assert.equal(response.status,403,path);assert.match(await response.text(),/primary OrgPortal/);
 }
});
test('documented support evidence replicates without its creator identity',async()=>{
 const primary=setup(),local=setup();
 try {
  insert(primary,'funder');insert(primary,'recipient');
  primary.sqlite.exec("INSERT INTO organization_support_records(id,from_organization_id,to_organization_id,from_label,to_label,support_kind,description,source_url,created_at,created_by_user_id) VALUES('support','funder','recipient','Funder','Recipient','mentoring','Mentorship','https://example.test/evidence','2026-10-05','private-creator')");
  await replicateOrganizations(env(local),async()=>organizationSnapshot(primary.asD1(),new Request(source)));
  const row=local.sqlite.prepare('SELECT * FROM organization_support_records').get()!;assert.equal(row.description,'Mentorship');assert.equal(row.created_by_user_id,null);
  primary.sqlite.exec("DELETE FROM organization_support_records; DELETE FROM organizations WHERE id='recipient'");expire(local);
  await replicateOrganizations(env(local),async()=>organizationSnapshot(primary.asD1(),new Request(source)));
  assert.equal(local.sqlite.prepare('SELECT count(*) n FROM organization_support_records').get()!.n,0);
 }finally{primary.sqlite.close();local.sqlite.close();}
});
