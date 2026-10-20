import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { normalizeOrganizationLinks, readOrganizationLinks } from '../../shared/organizationLinks';
import { posterLinkTarget, renderEventPoster } from '../src/eventPoster';

const sample=[{id:'wa',type:'whatsapp',url:'https://chat.whatsapp.com/Group123'},{id:'calendar',type:'luma',url:'https://luma.com/lifetech'},{id:'tickets',type:'eventbrite',url:'https://www.eventbrite.com/o/lifetech'}];
test('typed organization links support several popular providers and multiple links per type',()=>{
 assert.deepEqual(normalizeOrganizationLinks(sample),sample);
 assert.equal(normalizeOrganizationLinks([...sample,{id:'second-calendar',type:'luma',url:'https://luma.com/other',label:'Workshops'}]).length,4);
 for(const links of [[sample[0],sample[0]],[{id:'bad',type:'unknown',url:'https://example.com'}],[{id:'bad',type:'website',url:'javascript:alert(1)'}],[{id:'bad',type:'website',url:'https://user:pass@example.com'}],[{id:'bad',type:'whatsapp',url:'https://chat.whatsapp.com.evil.test/Group'}]]) assert.throws(()=>normalizeOrganizationLinks(links));
 assert.deepEqual(readOrganizationLinks('bad json'),[]);
 assert.deepEqual(readOrganizationLinks([sample[0],{id:'bad',type:'website',url:'javascript:bad'}]),[sample[0]]);
});
test('posters resolve stable organization link IDs, including rotations and removal',async()=>{
 const page='https://local.test/events/demo';
 for(const link of sample) assert.equal(posterLinkTarget(page,`org-link:${link.id}`,[],null,readOrganizationLinks(sample)),link.url);
 const rotated=readOrganizationLinks([{...sample[1],url:'https://luma.com/new'}]);
 assert.equal(posterLinkTarget(page,'org-link:calendar',[],null,rotated),'https://luma.com/new');
 assert.equal(posterLinkTarget(page,'org-link:calendar',[],null,[]),page);
 assert.equal(posterLinkTarget(page,'whatsapp',[],null,readOrganizationLinks(sample)),sample[0].url);
 const svg=await renderEventPoster({title:'Demo'},sample[1].url,'letter',{name:'LifeTech'},'light',{organizationLink:true});assert.match(svg,/Scan to connect/);
});
test('migration moves legacy social settings into typed organization links and preserves audit coverage',()=>{
 const db=new DatabaseSync(':memory:');try{
  const folder=new URL('../migrations/',import.meta.url);
  for(const file of readdirSync(folder).filter(file=>file.endsWith('.sql') && Number(file.slice(0,4))<92).sort()) db.exec(readFileSync(new URL(file,folder),'utf8'));
  db.exec(`INSERT INTO organizations(id,name,slug) VALUES ('org','LifeTech','lifetech'),('other','Other','other'); INSERT INTO group_sites(id,slug,hostname,name,tagline,organization_id,home_org_slug,feature_config) VALUES ('site','lifetech','local.test','LifeTech','LifeTech','org','lifetech','{"whatsappUrl":"https://chat.whatsapp.com/Group123","lumaUrl":"https://luma.com/lifetech","eventbriteUrl":"https://www.eventbrite.com/o/lifetech","other":true}');`);
  db.exec(readFileSync(new URL('../migrations/0093_organization_links.sql',import.meta.url),'utf8'));
  const links=readOrganizationLinks(db.prepare('SELECT links_json FROM organizations WHERE id=?').get('org')!.links_json);
  assert.deepEqual(links.map(link=>link.type),['whatsapp','luma','eventbrite']);
  assert.equal(db.prepare('SELECT links_json FROM organizations WHERE id=?').get('other')!.links_json,'[]');
  assert.deepEqual(JSON.parse(String(db.prepare('SELECT feature_config FROM group_sites WHERE id=?').get('site')!.feature_config)),{other:true});
  db.prepare('UPDATE organizations SET links_json=? WHERE id=?').run(JSON.stringify(sample),'org');
  const journal=db.prepare("SELECT after_json FROM change_journal WHERE table_name='organizations' AND operation='update' ORDER BY sequence DESC LIMIT 1").get()!;
  assert.deepEqual(JSON.parse(JSON.parse(String(journal.after_json)).links_json),sample);
 }finally{db.close();}
});

test('profile API saves organization links and event reads use the host organization', async t => {
  const { app }=await import('../src/index');
  const { identityProfile }=await import('./helpers/identityProfile');
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const folder=new URL('../migrations/',import.meta.url);
  for(const file of readdirSync(folder).filter(file=>file.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file,folder),'utf8'));
  db.exec("INSERT INTO organizations(id,name,slug) VALUES ('org','LifeTech','lifetech'),('other','Other','other'); INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES ('org','admin','administrator','active'); INSERT INTO events(id,ingest_key,title,slug,host_org_id) VALUES ('event','event','Demo','demo','org')");
  const database={prepare(query:string){const stmt=db.prepare(query); const bound=(args:any[])=>({bind:(...values:any[])=>bound(values),first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}})});return bound([])}} as unknown as D1Database;
  const env={DB:database,PIDP_BASE_URL:'https://local-id.test',PUBLIC_PORTAL_BASE_URL:'https://local.test'} as Env;
  const original=globalThis.fetch;globalThis.fetch=async()=>Response.json(identityProfile({id:'admin',full_name:'Local administrator',is_sysadmin:false}));t.after(()=>{globalThis.fetch=original});
  const patch=(body:unknown)=>app.request('https://local.test/api/network/orgs/org',{method:'PATCH',headers:{Authorization:'Bearer local-test-fixture','Content-Type':'application/json'},body:JSON.stringify(body)},env);
  const links=[{id:'whatsapp',type:'whatsapp',url:'https://chat.whatsapp.com/Group123'},{id:'calendar',type:'luma',url:'https://luma.com/lifetech'}];
  assert.equal((await patch({links})).status,200);
  assert.equal((await patch({name:'Updated LifeTech'})).status,200);
  for(const identifier of ['org','lifetech']) {
    const response=await app.request(`https://local.test/api/network/orgs/public/${identifier}`,{},env);
    assert.equal(response.status,200);
    assert.deepEqual((await response.json() as any).links,links);
  }
  const event=await app.request('https://local.test/api/network/events/public/demo',{},env);
  assert.equal(event.status,200);
  assert.deepEqual((await event.json() as any).organization_links,links);
  assert.equal((await patch({links:[{id:'bad',type:'whatsapp',url:'https://evil.test/invite'}]})).status,400);
  assert.deepEqual(JSON.parse(String(db.prepare('SELECT links_json FROM organizations WHERE id=?').get('org')!.links_json)),links);
  db.exec("UPDATE organization_memberships SET role='member'");
  assert.equal((await patch({links:[]})).status,403);
  db.exec("UPDATE organization_memberships SET role='administrator'");
  assert.equal((await patch({links:[]})).status,200);
  assert.equal(db.prepare('SELECT links_json FROM organizations WHERE id=?').get('org')!.links_json,'[]');
});
