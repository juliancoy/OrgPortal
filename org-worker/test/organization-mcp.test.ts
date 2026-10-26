import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readCurrentSchemaFileSync as readFileSync } from './helpers/currentSchema';
import { runOrganizationOperation } from '../src/organizationMcp';
import { claimOrganization } from '../src/organizationIam';

function database() {
  const sql = new DatabaseSync(':memory:');
  for (const file of ['0002_org_event_directories.sql', '0015_organization_iam.sql', '0017_event_mcp_operations.sql','0043_organization_media.sql']) {
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

function disenrollmentFixture(t: {after: (fn:()=>void)=>void}) {
  const {db,sql}=database();t.after(()=>sql.close());
  sql.exec(`INSERT INTO organizations(id,name,slug) VALUES('anchor','Anchor Advance Care LLC','anchor'),('other','Other','other');
    INSERT INTO organization_memberships(organization_id,user_id,role,status,pending_organizer) VALUES
    ('anchor','existing-pidp-user','member','active',1),('anchor','another-member','member','active',0),('other','existing-pidp-user','member','active',0);`);
  const run=(args:unknown={organizationId:'anchor'},actor=identity)=>runOrganizationOperation(db,actor,'disenroll',args,async()=>assert.fail('Must not create an organization'));
  return {db,sql,run};
}
test('self disenrollment previews and removes only the caller with a one-use receipt',async t=>{
  const {db,sql,run}=disenrollmentFixture(t);
  const preview=await run() as any;
  assert.equal(preview.userId,identity.userId);assert.equal(preview.organization.name,'Anchor Advance Care LLC');
  assert.equal(preview.effects.changesEmailPreferences,false);
  assert.equal(sql.prepare("SELECT status FROM organization_memberships WHERE organization_id='anchor' AND user_id=?").get(identity.userId)!.status,'active');
  await assert.rejects(run({organizationId:'anchor',confirm:true}),/preview first/);
  await assert.rejects(run({organizationId:'anchor',confirm:true,previewId:preview.previewId},{...identity,userId:'another-member'}),/another user|changed/);
  const applied=await run({organizationId:'anchor',confirm:true,previewId:preview.previewId}) as any;
  assert.equal(applied.result.status,'inactive');assert.equal(applied.result.user_id,identity.userId);
  assert.equal(sql.prepare("SELECT pending_organizer FROM organization_memberships WHERE organization_id='anchor' AND user_id=?").get(identity.userId)!.pending_organizer,0);
  assert.equal(sql.prepare("SELECT count(*) n FROM organization_memberships WHERE status='active'").get()!.n,2);
  const listed=await runOrganizationOperation(db,identity,'list',{},async()=>null) as any;
  assert.deepEqual(listed.organizations.map((org:any)=>org.id),['other']);
  assert.equal(sql.prepare('SELECT status FROM event_mcp_operations WHERE id=?').get(preview.previewId)!.status,'completed');
  await assert.rejects(run({organizationId:'anchor',confirm:true,previewId:preview.previewId}),/membership required/);
  sql.exec("UPDATE organization_memberships SET status='active',pending_organizer=1 WHERE organization_id='anchor' AND user_id='existing-pidp-user'");
  await assert.rejects(run({organizationId:'anchor',confirm:true,previewId:preview.previewId}),/already used|changed/);
});
test('self disenrollment rejects missing scopes, impersonation, outsiders, owners and administrators',async t=>{
  const {sql,run}=disenrollmentFixture(t);
  for(const scopes of [[],['org:portal.read'],['org:portal.write']])await assert.rejects(run(undefined,{...identity,scopes}),/Missing portal scope/);
  await assert.rejects(run(undefined,{...identity,userId:'outsider'}),/membership required/);
  await assert.rejects(run({organizationId:'anchor',user_id:'another-member'}),/Unrecognized key/);
  for(const role of ['owner','administrator']){
    sql.prepare('UPDATE organization_memberships SET role=? WHERE user_id=?').run(role,identity.userId);
    await assert.rejects(run(),/transfer or remove admin/);
  }
  sql.exec("UPDATE organization_memberships SET role='member'; INSERT INTO organization_ownerships(id,organization_id,owner_user_id,status,started_at) VALUES('own','anchor','existing-pidp-user','active','now')");
  await assert.rejects(run(),/transfer or remove admin/);
});
test('self disenrollment refuses expired, cross-organization and stale receipts',async t=>{
  const {sql,run}=disenrollmentFixture(t);
  const preview=await run() as any;
  await assert.rejects(run({organizationId:'other',confirm:true,previewId:preview.previewId}),/changed/);
  sql.exec("UPDATE organization_memberships SET updated_at='newer' WHERE organization_id='anchor'");
  await assert.rejects(run({organizationId:'anchor',confirm:true,previewId:preview.previewId}),/changed/);
  const fresh=await run() as any;
  sql.prepare('UPDATE event_mcp_operations SET expires_at=0 WHERE id=?').run(fresh.previewId);
  await assert.rejects(run({organizationId:'anchor',confirm:true,previewId:fresh.previewId}),/expired/);
  assert.equal(sql.prepare("SELECT count(*) n FROM organization_memberships WHERE status='active'").get()!.n,3);
});
test('atomic self disenrollment cannot detach a concurrently promoted member or active owner',async t=>{
  const {disenrollOrganizationMember}=await import('../src/organizationIam');
  const {sql,db}=disenrollmentFixture(t);
  const before=sql.prepare("SELECT updated_at FROM organization_memberships WHERE organization_id='anchor' AND user_id=?").get(identity.userId)!;
  sql.exec("UPDATE organization_memberships SET role='administrator' WHERE user_id='existing-pidp-user'");
  await assert.rejects(disenrollOrganizationMember(db,'anchor',identity.userId,before.updated_at as string,1),/changed/);
  sql.exec("UPDATE organization_memberships SET role='member'; INSERT INTO organization_ownerships(id,organization_id,owner_user_id,status,started_at) VALUES('own','anchor','existing-pidp-user','active','now')");
  await assert.rejects(disenrollOrganizationMember(db,'anchor',identity.userId,before.updated_at as string,1),/changed/);
  assert.equal(sql.prepare("SELECT count(*) n FROM organization_memberships WHERE status='active'").get()!.n,3);
});

test('organization creation requires scope and a matching one-use receipt', async () => {
  const { db, sql } = database(); let writes = 0;
  const create = async (_actor, payload) => { assert.equal(payload.kind, 'team'); writes++; return { id: 'new-org' }; };
  const args = { name: 'LifeTech', city: 'Baltimore', kind: 'team', acknowledgeOwnership: true as const };
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
  const reopened=await run(db,admin,'get',{organizationId:args.organizationId}) as any;
  assert.equal(reopened.organization.description,args.description);
  await assert.rejects(run(db,identity,'get',{organizationId:args.organizationId}),/membership/);
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

test('native organization image upload previews metadata and applies scoped media once',async()=>{
 const {db,sql}=database();const {runOrganizationProfileOperation:run}=await import('../src/organizationProfileMcp');
 sql.exec("INSERT INTO organizations(id,name,slug) VALUES('org','Brand test','brand-test')");
 await claimOrganization(db,'org',{id:identity.userId,name:'Owner',email:null,isOperator:false},new Date().toISOString());
 const objects=new Map<string,Uint8Array>();
 const images={PUBLIC_PORTAL_BASE_URL:'https://orgportal.cc',SCAN_IMAGES:{put:async(key:string,bytes:Uint8Array)=>{objects.set(key,bytes);return{}},delete:async(key:string)=>{objects.delete(key)}} as unknown as R2Bucket};
 const dataBase64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 const args={organizationId:'org',image_upload:{dataBase64,contentType:'image/png',label:'Primary identity',alt:'Brand test identity'}};
 try{
  await assert.rejects(run(db,{...identity,userId:'outsider'},'update',args,images),/management/);
  const preview=await run(db,identity,'update',args,images) as any;
  assert.equal(objects.size,0);assert.ok(!JSON.stringify(preview).includes(dataBase64));assert.equal(preview.image.contentType,'image/png');
  assert.match(preview.after.image_url,/https:\/\/orgportal.cc\/api\/org\/api\/network\/orgs\/public\/brand-test\/media\/[0-9a-f]{64}$/);
  const saved=await run(db,identity,'update',{...args,previewId:preview.previewId,confirm:true},images) as any;
  assert.equal(saved.organization.image_url,preview.after.image_url);assert.equal(objects.size,1);
  const media=JSON.parse(sql.prepare("SELECT media_json FROM organizations WHERE id='org'").get()!.media_json as string);
  assert.equal(media.length,1);assert.ok(objects.has(media[0].image_key));assert.equal(media[0].alt,'Brand test identity');
  await assert.rejects(run(db,identity,'update',{...args,previewId:preview.previewId,confirm:true},images),/used|changed/);
  const again=await run(db,identity,'update',args,images) as any;await run(db,identity,'update',{...args,previewId:again.previewId,confirm:true},images);
  assert.equal(objects.size,1);assert.equal(JSON.parse(String(sql.prepare("SELECT media_json FROM organizations WHERE id='org'").get()!.media_json)).length,1);
  await assert.rejects(run(db,identity,'update',{...args,image_upload:{...args.image_upload,contentType:'image/jpeg'}},images),/declared type/);
  await assert.rejects(run(db,identity,'update',{...args,image_upload:{...args.image_upload,dataBase64:btoa('<svg>active</svg>')}},images),/valid PNG/);
 }finally{sql.close()}
});

test('MCP image URLs import bounded bytes into native storage and reject unsafe sources',async t=>{
 const {db,sql}=database();const {runOrganizationProfileOperation:run}=await import('../src/organizationProfileMcp');
 const {publicImageSource}=await import('../src/organizationBrandImage');
 for(const url of ['http://public.example/image.png','https://localhost/image.png','https://127.0.0.1/image.png','https://[::1]/image.png','https://host.internal/image.png','https://example.com:444/image.png'])assert.throws(()=>publicImageSource(url));
 sql.exec("INSERT INTO organizations(id,name,slug) VALUES('org','Brand test','brand-test')");
 await claimOrganization(db,'org',{id:identity.userId,name:'Owner',email:null,isOperator:false},new Date().toISOString());
 const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);let writes=0;
 const images={PUBLIC_PORTAL_BASE_URL:'https://orgportal.cc',SCAN_IMAGES:{put:async()=>{writes++;return{}},delete:async()=>{}} as unknown as R2Bucket};
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(options.redirect,'manual');return new Response(bytes,{headers:{'content-type':'image/png'}})});
 const args={organizationId:'org',image_url:'https://images.example/identity.png'};
 try{
  const preview=await run(db,identity,'update',args,images) as any;assert.equal(writes,0);
  await run(db,identity,'update',{...args,confirm:true,previewId:preview.previewId},images);assert.equal(writes,1);
  assert.ok(!String(sql.prepare("SELECT image_url FROM organizations WHERE id='org'").get()!.image_url).includes('images.example'));
  t.mock.method(globalThis,'fetch',async()=>new Response('redirect',{status:302,headers:{location:'https://localhost'}}));
  await assert.rejects(run(db,identity,'update',args,images),/could not be downloaded/);
  t.mock.method(globalThis,'fetch',async()=>new Response(bytes,{headers:{'content-length':String(9*1024*1024)}}));
  await assert.rejects(run(db,identity,'update',args,images),/8 MB/);
 }finally{sql.close()}
});

test('native upload rejects permission revocation during publication and cleans its object',async()=>{
 const {db,sql}=database();const {runOrganizationProfileOperation:run}=await import('../src/organizationProfileMcp');
 sql.exec("INSERT INTO organizations(id,name,slug) VALUES('org','Brand test','brand-test')");
 await claimOrganization(db,'org',{id:identity.userId,name:'Owner',email:null,isOperator:false},new Date().toISOString());
 const objects=new Set<string>();
 const images={SCAN_IMAGES:{put:async(key:string)=>{objects.add(key);sql.exec("UPDATE organization_memberships SET status='inactive'");return{}},delete:async(key:string)=>{objects.delete(key)}} as unknown as R2Bucket};
 const args={organizationId:'org',image_upload:{dataBase64:'iVBORw0KGgo=',contentType:'image/png'}};
 try{
  const preview=await run(db,identity,'update',args,images) as any;
  await assert.rejects(run(db,identity,'update',{...args,previewId:preview.previewId,confirm:true},images),/permission changed/);
  assert.equal(objects.size,0);assert.equal(sql.prepare("SELECT image_url FROM organizations WHERE id='org'").get()!.image_url,null);
 }finally{sql.close()}
});

test('profile slugs resolve to canonical IDs for member permissions, previews, writes and receipts',async()=>{
 const {db,sql}=database();const {runOrganizationProfileOperation:run}=await import('../src/organizationProfileMcp');
 sql.exec("INSERT INTO organizations(id,name,slug,tags) VALUES('canonical-id','Palava Hut','palava-hut','[]'),('other-id','Other','other','[]')");
 await claimOrganization(db,'canonical-id',{id:identity.userId,name:'Owner',email:null,isOperator:false},new Date().toISOString());
 try{
  const read=await run(db,identity,'get',{organizationId:'palava-hut'}) as any;assert.equal(read.organization.id,'canonical-id');
  const args={organizationId:'palava-hut',description:'Reviewed description'};const preview=await run(db,identity,'update',args) as any;assert.equal(preview.organizationId,'canonical-id');
  const saved=await run(db,identity,'update',{...args,organizationId:'canonical-id',previewId:preview.previewId,confirm:true}) as any;assert.equal(saved.organization.id,'canonical-id');assert.equal(saved.organization.description,args.description);
  assert.equal((await run(db,identity,'status',{organizationId:'palava-hut',previewId:preview.previewId}) as any).status,'completed');
  await assert.rejects(run(db,{...identity,userId:'outsider'},'get',{organizationId:'palava-hut'}),/membership/);
  await assert.rejects(run(db,identity,'update',{organizationId:'other',description:'Denied'}),/management/);
  await assert.rejects(run(db,{...identity,isOperator:true},'get',{organizationId:'missing'}),/Organization not found/);
  const operator=await run(db,{...identity,userId:'operator',isOperator:true},'get',{organizationId:'palava-hut'}) as any;assert.equal(operator.organization.id,'canonical-id');
  await assert.rejects(run(db,identity,'update',{organizationId:'palava-hut',description:'Second write',previewId:preview.previewId,confirm:true}),/already used|changed/);
 }finally{sql.close()}
});
