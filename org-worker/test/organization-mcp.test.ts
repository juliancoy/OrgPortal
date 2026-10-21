import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readCurrentSchemaFileSync as readFileSync } from './helpers/currentSchema';
import { runOrganizationOperation } from '../src/organizationMcp';
import { claimOrganization } from '../src/organizationIam';

function database() {
  const sql = new DatabaseSync(':memory:');
  for (const file of ['0002_org_event_directories.sql', '0015_organization_iam.sql', '0017_event_mcp_operations.sql']) {
    sql.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  sql.exec("CREATE TABLE group_sites (id TEXT PRIMARY KEY, home_org_slug TEXT, feature_config TEXT NOT NULL DEFAULT '{}');\n CREATE TABLE onboarding_enrollments (group_site_id TEXT, user_id TEXT, completed_at TEXT, PRIMARY KEY(group_site_id,user_id));");
  sql.exec(readFileSync(new URL("../migrations/0067_pending_organizers.sql", import.meta.url), "utf8"));
  const db = { prepare(query: string) {
    const statement = sql.prepare(query);
    const bound = (args: any[]) => ({ bind: (...args: any[]) => bound(args),
      first: async () => statement.get(...args) || null,
      all: async () => ({ results: statement.all(...args) }),
      run: async () => statement.run(...args),
    });
    return bound([]);
  }, async batch(statements: { run(): Promise<unknown> }[]) {
    sql.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } } as unknown as D1Database;
  return { sql, db };
}
const identity = { userId: 'existing-pidp-user', scopes: ['org:portal.read', 'org:portal.write'] };

test('organization creation requires scope and a matching one-use receipt', async () => {
  const { db, sql } = database(); let writes = 0;
  const create = async () => { writes++; return { id: 'new-org' }; };
  const args = { name: 'LifeTech', city: 'Baltimore' };
  await assert.rejects(runOrganizationOperation(db, { ...identity, scopes: ['org:portal.read'] }, 'create', args, create), /Missing portal scope/);
  await assert.rejects(runOrganizationOperation(db, identity, 'create', { ...args, confirm: true }, create), /preview first/);
  const preview = await runOrganizationOperation(db, identity, 'create', args, create) as { previewId: string };
  assert.equal(writes, 0);
  await assert.rejects(runOrganizationOperation(db, identity, 'create', { ...args, name: 'Changed', confirm: true, previewId: preview.previewId }, create), /Preview is expired/);
  await runOrganizationOperation(db, identity, 'create', { ...args, confirm: true, previewId: preview.previewId }, create);
  assert.equal(writes, 1);
  await assert.rejects(runOrganizationOperation(db, identity, 'create', { ...args, confirm: true, previewId: preview.previewId }, create), /already used/);
  sql.close();
});

test('membership writes preserve PIdP IDs and enforce organization permissions', async () => {
  const { db, sql } = database();
  sql.exec("INSERT INTO organizations (id, name, slug, tags, city) VALUES ('org', 'Existing', 'existing', '[]', 'Baltimore')");
  await claimOrganization(db, 'org', { id: identity.userId, name: 'Owner', email: null, isOperator: false }, new Date().toISOString());
  const create = async () => null;
  const args = { organizationId: 'org', user_id: 'same-pidp-member', role: 'member' };
  await assert.rejects(runOrganizationOperation(db, { ...identity, userId: 'outsider' }, 'member', args, create), /access|permission|manage/i);
  const preview = await runOrganizationOperation(db, identity, 'member', args, create) as { previewId: string };
  await runOrganizationOperation(db, identity, 'member', { ...args, confirm: true, previewId: preview.previewId }, create);
  const members = await runOrganizationOperation(db, identity, 'members', { organizationId: 'org' }, create) as { members: { user_id: string }[] };
  assert.ok(members.members.some(member => member.user_id === 'same-pidp-member'));
  await assert.rejects(runOrganizationOperation(db, identity, 'create', { name: 'Existing', city: 'Baltimore' }, create), /already exists/);
  sql.close();
});

test('pending organizer previews require unchanged onboarding and one-use confirmation', async () => {
  const { db, sql } = database();
  sql.exec(`INSERT INTO organizations (id,name,slug,tags) VALUES ('org','LifeTech','lifetech','[]');
    INSERT INTO group_sites VALUES ('tenant','lifetech','{"onboarding":{"enabled":true}}')`);
  await claimOrganization(db, 'org', { id: identity.userId, name: 'Owner', email: null, isOperator: false }, new Date().toISOString());
  const args = { organizationId: 'org', user_id: 'candidate', role: 'administrator' };
  const create = async () => null;
  const preview = await runOrganizationOperation(db, identity, 'member', args, create) as any;
  assert.equal(preview.assignment.pending_organizer, 1);
  assert.equal(sql.prepare("SELECT role FROM organization_memberships WHERE user_id='candidate'").get(), undefined);
  const applied = await runOrganizationOperation(db, identity, 'member', { ...args, confirm: true, previewId: preview.previewId }, create) as any;
  assert.equal(applied.result.role, 'member'); assert.equal(applied.result.pending_organizer, 1);
  await assert.rejects(runOrganizationOperation(db, identity, 'member', { ...args, confirm: true, previewId: preview.previewId }, create), /already used|expired/);
  const stale = await runOrganizationOperation(db, identity, 'member', args, create) as any;
  sql.exec(`INSERT INTO onboarding_enrollments VALUES ('tenant','candidate','done')`);
  await assert.rejects(runOrganizationOperation(db, identity, 'member', { ...args, confirm: true, previewId: stale.previewId }, create), /expired|match/);
  const ready = await runOrganizationOperation(db, identity, 'member', args, create) as any;
  assert.equal(ready.assignment.role, 'administrator');
  await runOrganizationOperation(db, identity, 'member', { ...args, confirm: true, previewId: ready.previewId }, create);
  assert.equal(sql.prepare("SELECT role FROM organization_memberships WHERE user_id='candidate'").get()!.role, 'administrator');
  sql.close();
});

test('profile edits enforce scope, management, exact previews, state changes and clearing', async () => {
  const { db, sql } = database();
  const { runOrganizationProfileOperation: run } = await import('../src/organizationProfileMcp');
  sql.exec("INSERT INTO organizations (id,name,slug,description,image_url,tags,city) VALUES ('org','Existing','existing','Old','https://example.com/old.png','[\"startup\"]','Baltimore')");
  await claimOrganization(db,'org',{id:identity.userId,name:'Owner',email:null,isOperator:false},new Date().toISOString());
  const args={organizationId:'org',description:'Researched description',image_url:'https://example.com/new.png'};
  try {
    await assert.rejects(run(db,{...identity,scopes:['org:portal.read']},'update',args),/scope/);
    await assert.rejects(run(db,{...identity,userId:'outsider'},'update',args),/management/);
    for(const fields of [{image_url:'javascript:alert(1)'},{image_url:'https://user:password@example.com/img.png'},{description:'x'.repeat(5001)},{claimed_by_user_id:'owner'},{}]) await assert.rejects(run(db,identity,'update',{organizationId:'org',...fields}));
    await assert.rejects(run(db,identity,'update',{...args,confirm:true}),/preview first/);
    const preview=await run(db,identity,'update',args) as any;
    assert.equal(sql.prepare("SELECT description FROM organizations WHERE id='org'").get()!.description,'Old');
    await assert.rejects(run(db,identity,'update',{...args,description:'Changed',confirm:true,previewId:preview.previewId}),/expired|changed/);
    const saved=await run(db,identity,'update',{...args,confirm:true,previewId:preview.previewId}) as any;
    assert.equal(saved.organization.description,args.description);assert.deepEqual(saved.organization.tags,['startup']);assert.equal(saved.organization.name,'Existing');
    assert.equal((await run(db,identity,'status',{organizationId:'org',previewId:preview.previewId}) as any).status,'completed');
    await assert.rejects(run(db,identity,'update',{...args,confirm:true,previewId:preview.previewId}),/already used|changed/);
    const stale=await run(db,identity,'update',args) as any;
    sql.exec("UPDATE organizations SET name='Concurrent edit' WHERE id='org'");
    await assert.rejects(run(db,identity,'update',{...args,confirm:true,previewId:stale.previewId}),/expired|changed/);
    const clear={organizationId:'org',description:null,image_url:null};const fresh=await run(db,identity,'update',clear) as any;
    sql.exec("UPDATE organization_memberships SET role='member' WHERE user_id='existing-pidp-user'");
    await assert.rejects(run(db,identity,'update',{...clear,confirm:true,previewId:fresh.previewId}),/management/);
    sql.exec("UPDATE organization_memberships SET role='administrator' WHERE user_id='existing-pidp-user'");
    const cleared=await run(db,identity,'update',{...clear,confirm:true,previewId:fresh.previewId}) as any;
    assert.equal(cleared.organization.image_url,null);assert.equal(cleared.organization.description,null);
  } finally {sql.close();}
});

test('verified operators edit catalog profiles without claiming organizations; scopes and receipts remain required',async()=>{
 const {db,sql}=database();const {runOrganizationProfileOperation:run}=await import('../src/organizationProfileMcp');
 sql.exec("INSERT INTO organizations(id,name,slug,tags) VALUES('unclaimed','Startup','startup','[\"startup\"]')");const admin={...identity,isOperator:true};const args={organizationId:'unclaimed',description:'Verified research'};
 try{
  await assert.rejects(run(db,identity,'update',args),/management/);
  await assert.rejects(run(db,{...admin,scopes:['org:events.write']},'update',args),/scope/);
  await assert.rejects(run(db,identity,'update',{...args,isOperator:true}));
  const preview=await run(db,admin,'update',args) as any;
  await assert.rejects(run(db,{...admin,isOperator:false},'update',{...args,confirm:true,previewId:preview.previewId}),/management/);
  const result=await run(db,admin,'update',{...args,confirm:true,previewId:preview.previewId}) as any;assert.equal(result.organization.description,args.description);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM organization_memberships WHERE organization_id='unclaimed'").get()!.n,0);
 }finally{sql.close()}
});

test('creation never overwrites an existing source match and creates distinct owned IDs atomically', async () => {
 const {insertOwnedOrganization}=await import('../src/organizationCreation');
 const {db,sql}=database(); const actor={id:identity.userId,name:'Owner',email:null,isOperator:false};
 try {
  const life:any=await insertOwnedOrganization(db,actor,{name:'LifeTech',slug:'lifetech',city:'Baltimore',source_url:'https://lifetech.fyi/',tags:'[]'});
  const before=sql.prepare('SELECT * FROM organizations WHERE id=?').get(life.id);
  await assert.rejects(insertOwnedOrganization(db,actor,{name:'medtech.social',slug:'medtech',city:'Baltimore',source_url:'https://lifetech.fyi',tags:'[]'}),/already exists/);
  assert.deepEqual(sql.prepare('SELECT * FROM organizations WHERE id=?').get(life.id),before);
  await assert.rejects(runOrganizationOperation(db,identity,'create',{name:'different',city:'Baltimore',source_url:'https://lifetech.fyi'},async()=>null),/already exists/);
  const med:any=await insertOwnedOrganization(db,actor,{name:'medtech.social',slug:'medtech',city:'Baltimore',source_url:'https://medtech.social',tags:'[]'});
  assert.notEqual(med.id,life.id);
  assert.equal(sql.prepare('SELECT count(*) n FROM organization_memberships WHERE user_id=? AND role=\'owner\'').get(identity.userId)!.n,2);
  sql.exec("CREATE TRIGGER reject_membership BEFORE INSERT ON organization_memberships BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  await assert.rejects(insertOwnedOrganization(db,actor,{name:'Rollback',slug:'rollback',city:'Baltimore',tags:'[]'}),/fixture failure/);
  assert.equal(sql.prepare("SELECT count(*) n FROM organizations WHERE slug='rollback'").get()!.n,0);
  assert.deepEqual(sql.prepare('SELECT * FROM organizations WHERE id=?').get(life.id),before);
 }finally{sql.close();}
});


test('organization profile links are validated, reviewed, authorized and clearable', async () => {
 const {db,sql}=database();const {runOrganizationProfileOperation:run}=await import('../src/organizationProfileMcp');
 try {
  sql.exec("INSERT INTO organizations(id,name,slug,tags) VALUES ('org','LifeTech','lifetech','[]'); INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES ('org','existing-pidp-user','administrator','active')");
  const links=[{id:'whatsapp',type:'whatsapp',url:'https://chat.whatsapp.com/Group123'},{id:'calendar',type:'luma',url:'https://luma.com/lifetech'},{id:'tickets',type:'eventbrite',url:'https://www.eventbrite.com/o/lifetech'}];
  const args={organizationId:'org',links};
  await assert.rejects(run(db,identity,'update',{...args,links:[{id:'bad',type:'website',url:'javascript:alert(1)'}]}));
  const preview=await run(db,identity,'update',args) as any;
  assert.deepEqual(preview.after.links,links);
  assert.equal(sql.prepare('SELECT links_json FROM organizations WHERE id=?').get('org')!.links_json,'[]');
  const result=await run(db,identity,'update',{...args,confirm:true,previewId:preview.previewId}) as any;
  assert.deepEqual(result.organization.links,links);
  const clearing={organizationId:'org',links:[]};const clearPreview=await run(db,identity,'update',clearing) as any;
  const cleared=await run(db,identity,'update',{...clearing,confirm:true,previewId:clearPreview.previewId}) as any;
  assert.deepEqual(cleared.organization.links,[]);
 }finally{sql.close();}
});
