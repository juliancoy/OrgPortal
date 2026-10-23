import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventTestDb} from './event-test-db';
import {runMemberTitlesOperation,organizationMemberTitleRoutes,organizationTitlePeople} from '../src/organizationMemberTitles';
const identity={userId:'pidp-user',scopes:['org:portal.read','org:portal.write']};
function fixture(){return new EventTestDb(`ALTER TABLE organization_memberships ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
 ALTER TABLE organization_memberships ADD COLUMN user_name TEXT;
 ALTER TABLE organization_memberships ADD COLUMN user_email TEXT;
 CREATE TABLE organization_personnel_motions(id TEXT,organization_id TEXT,target_user_id TEXT,decision TEXT,status TEXT,updated_at TEXT);
 CREATE TABLE user_contact_pages(user_id TEXT PRIMARY KEY,user_name TEXT,user_email TEXT,photo_url TEXT,slug TEXT,enabled INTEGER DEFAULT 0,bio TEXT,headline TEXT);
 CREATE TABLE organization_personnel_relationships(organization_id TEXT,user_id TEXT,scheme TEXT,class_key TEXT,user_name TEXT,status TEXT,expires_at INTEGER);
 CREATE TABLE ledger_accounts(user_id TEXT,name TEXT,email TEXT,entity_type TEXT);
 INSERT INTO organization_memberships(organization_id,user_id,user_name,role,status) VALUES('org-one','colleague','Dummy Colleague','member','active'),('org-one','inactive','Inactive','member','inactive');
 INSERT INTO organizations(id,name,slug) VALUES('other','Other','other');
 INSERT INTO user_contact_pages VALUES('pidp-user','Dummy Owner','private-owner@example.test','/private.png','private-owner',0,'Private biography','Private headline'),('colleague','Dummy Colleague','private-member@example.test','/public.png','dummy-colleague',1,'Public colleague biography','Public headline');
 `+readFileSync(new URL('../migrations/0102_organization_member_titles.sql',import.meta.url),'utf8')+readFileSync(new URL('../migrations/0104_organization_personnel_portraits.sql',import.meta.url),'utf8')+readFileSync(new URL('../migrations/0108_organization_member_descriptions.sql',import.meta.url),'utf8'))}
test('titles apply to members and owners without changing authorization; clearing, preview and replay are safe',async()=>{
 const db=fixture(),d1=db as unknown as D1Database;
 try{
  for(const user_id of ['pidp-user','colleague']){
   const args={organizationId:'org-one',user_id,titles:['CEO','Advisor']};
   const preview=await runMemberTitlesOperation(d1,identity,args) as {previewId:string;permissionsChanged:boolean;publicBoard:boolean};
   assert.equal(preview.permissionsChanged,false);assert.equal(preview.publicBoard,true);
   assert.equal((await db.prepare('SELECT titles_json FROM organization_memberships WHERE user_id=?').bind(user_id).first() as {titles_json:string}).titles_json,'[]');
   const saved=await runMemberTitlesOperation(d1,identity,{...args,previewId:preview.previewId,confirm:true}) as {titles:string[];role:string};
   assert.deepEqual(saved.titles,['CEO','Advisor']);assert.equal(saved.role,user_id==='pidp-user'?'owner':'member');
   await assert.rejects(runMemberTitlesOperation(d1,identity,{...args,previewId:preview.previewId,confirm:true}));
  }
  const clear={organizationId:'org-one',user_id:'colleague',titles:[]};const preview=await runMemberTitlesOperation(d1,identity,clear) as {previewId:string};
  await runMemberTitlesOperation(d1,identity,{...clear,previewId:preview.previewId,confirm:true});
  assert.equal((await db.prepare("SELECT titles_json FROM organization_memberships WHERE user_id='colleague'").first() as {titles_json:string}).titles_json,'[]');
  for(const titles of [['CEO','ceo'],[''],Array(9).fill('Advisor'),['A'.repeat(101)],['A\nB']])await assert.rejects(runMemberTitlesOperation(d1,identity,{...clear,titles}));
  await assert.rejects(runMemberTitlesOperation(d1,identity,{...clear,role:'administrator'}));
 }finally{db.close()}
});
test('title writes require live manager authority, scopes, exact tenant and unchanged state',async()=>{
 const db=fixture(),d1=db as unknown as D1Database,args={organizationId:'org-one',user_id:'colleague',titles:['CTO']};
 try{
  await assert.rejects(runMemberTitlesOperation(d1,{userId:'colleague',scopes:identity.scopes},args));
  await assert.rejects(runMemberTitlesOperation(d1,{...identity,scopes:['org:portal.read']},args));
  await assert.rejects(runMemberTitlesOperation(d1,identity,{...args,user_id:'inactive'}));
  await assert.rejects(runMemberTitlesOperation(d1,identity,{...args,organizationId:'other'}));
  const p=await runMemberTitlesOperation(d1,identity,args) as {previewId:string};
  await db.prepare("UPDATE organization_memberships SET titles_json='[\"Geneticist\"]' WHERE user_id='colleague'").run();
  await assert.rejects(runMemberTitlesOperation(d1,identity,{...args,previewId:p.previewId,confirm:true}));
  const p2=await runMemberTitlesOperation(d1,identity,args) as {previewId:string};
  const guarded={prepare(sql:string){if(sql.startsWith('UPDATE organization_memberships SET titles_json='))void db.prepare("UPDATE organization_memberships SET role='member' WHERE user_id='pidp-user'").run();return db.prepare(sql)}} as unknown as D1Database;
  await assert.rejects(runMemberTitlesOperation(guarded,identity,{...args,previewId:p2.previewId,confirm:true}));
  assert.equal((await db.prepare("SELECT titles_json FROM organization_memberships WHERE user_id='colleague'").first() as {titles_json:string}).titles_json,'["Geneticist"]');
 }finally{db.close()}
});
test('public Board exposes assigned roles and public portraits, not contact details or canonical account IDs',async()=>{
 const db=fixture(),d1=db as unknown as D1Database;
 try{
  await db.prepare("UPDATE organization_memberships SET titles_json='[\"Advisor\"]'").run();
  const routes=organizationMemberTitleRoutes(async()=>({id:'pidp-user'}),()=>new Response('Denied',{status:403}));
  const response=await routes.request('https://example.test/public/one/board',{}, {DB:d1} as Env);
  assert.equal(response.status,200);const data=await response.json() as {people:{name:string;photo_url:string|null;profile_slug:string|null;personnel_class:string}[]};
  assert.equal(data.people.length,2);assert.equal(data.people[0].name,'Dummy Owner');assert.equal(data.people[0].photo_url,null);assert.equal(data.people[0].profile_slug,null);assert.equal(data.people[0].personnel_class,'organizer');
  assert.equal(data.people[1].photo_url,'/public.png');assert.equal(data.people[1].personnel_class,'member');
  assert.doesNotMatch(JSON.stringify(data),/private-owner|private-member|pidp-user|user_id|user_email/);
  await db.prepare("INSERT INTO organization_personnel_motions VALUES('excluded','org-one','colleague','exclude','passed','2026-10-23')").run();
  assert.equal((await(await routes.request('https://example.test/public/one/board',{}, {DB:d1} as Env)).json() as {people:{personnel_class:string}[]}).people[1].personnel_class,'persona_non_grata');
  assert.equal((await routes.request('https://example.test/public/missing/board',{}, {DB:d1} as Env)).status,404);
  await db.prepare("DELETE FROM organization_memberships WHERE user_id='colleague'").run();
  assert.equal((await(await routes.request('https://example.test/public/one/board',{}, {DB:d1} as Env)).json() as {people:unknown[]}).people.length,1);
 }finally{db.close()}
});
test('MCP directory lookup uses live management checks and returns canonical identities',async()=>{
 const db=fixture(),d1=db as unknown as D1Database;
 try{
  const found=await organizationTitlePeople(d1,identity,{organizationId:'org-one',q:'Dummy Colleague'});
  assert.equal(found.people[0].user_id,'colleague');
  await assert.rejects(organizationTitlePeople(d1,{...identity,userId:'colleague'},{organizationId:'org-one',q:'Dummy'}));
  await assert.rejects(organizationTitlePeople(d1,{...identity,scopes:[]},{organizationId:'org-one',q:'Dummy'}));
 }finally{db.close()}
});

test('descriptions publish without titles, use exact receipts, preserve profiles and fall back only to public bios',async()=>{
 const db=fixture(),d1=db as unknown as D1Database;
 try {
  const routes=organizationMemberTitleRoutes(async()=>({id:'pidp-user'}),()=>new Response('Denied',{status:403}));
  const board=async()=>(await(await routes.request('https://example.test/public/one/board',{}, {DB:d1} as Env)).json()) as {people:{name:string;description:string|null}[]};
  const args={organizationId:'org-one',user_id:'colleague',titles:[],description:'Research consultant for this team.'};
  const p=await runMemberTitlesOperation(d1,identity,args) as {previewId:string};
  await assert.rejects(runMemberTitlesOperation(d1,identity,{...args,description:'Unreviewed',confirm:true,previewId:p.previewId}));
  const p2=await runMemberTitlesOperation(d1,identity,args) as {previewId:string};
  await runMemberTitlesOperation(d1,identity,{...args,confirm:true,previewId:p2.previewId});
  assert.equal((await board()).people[0].description,args.description);
  assert.equal((await db.prepare("SELECT bio FROM user_contact_pages WHERE user_id='colleague'").first() as {bio:string}).bio,'Public colleague biography');
  const titleOnly={organizationId:'org-one',user_id:'colleague',titles:['Advisor']};
  const p3=await runMemberTitlesOperation(d1,identity,titleOnly) as {previewId:string};
  await runMemberTitlesOperation(d1,identity,{...titleOnly,confirm:true,previewId:p3.previewId});
  assert.equal((await board()).people[0].description,args.description);
  const clear={...titleOnly,description:null};const p4=await runMemberTitlesOperation(d1,identity,clear) as {previewId:string};
  await runMemberTitlesOperation(d1,identity,{...clear,confirm:true,previewId:p4.previewId});
  assert.equal((await board()).people[0].description,'Public colleague biography');
  await db.prepare("UPDATE user_contact_pages SET enabled=0 WHERE user_id='colleague'").run();
  assert.equal((await board()).people[0].description,null);
  for(const description of ['x'.repeat(601),'bad\0bio'])await assert.rejects(runMemberTitlesOperation(d1,identity,{...titleOnly,description}));
  await assert.rejects(runMemberTitlesOperation(d1,{...identity,userId:'colleague'},args));
  await assert.rejects(runMemberTitlesOperation(d1,identity,{...args,organizationId:'other'}));
  const p5=await runMemberTitlesOperation(d1,identity,args) as {previewId:string};
  await db.prepare("UPDATE organization_memberships SET description='Concurrent update' WHERE user_id='colleague'").run();
  await assert.rejects(runMemberTitlesOperation(d1,identity,{...args,confirm:true,previewId:p5.previewId}));
  assert.doesNotMatch(JSON.stringify(await board()),/Private biography|Private headline/);
 }finally{db.close()}
});


test('Personnel includes public untitled members and sourced portraits, with exact receipts and no identity changes',async()=>{
 const db=fixture(),d1=db as unknown as D1Database;
 try {
  const routes=organizationMemberTitleRoutes(async()=>({id:'pidp-user'}),()=>new Response('Denied',{status:403}));
  const read=async(view:string)=>(await(await routes.request('https://example.test/public/one/'+view,{}, {DB:d1} as Env)).json()) as {people:{name:string;photo_url:string|null;photo_source_url:string|null;titles:string[]}[]};
  assert.equal((await read('board')).people.length,0);
  const roster=await read('personnel');assert.equal(roster.people.length,1);assert.equal(roster.people[0].name,'Dummy Colleague');
  const portrait={url:'https://example.com/officer.jpg',source_url:'https://example.com/people/officer'};
  const args={organizationId:'org-one',user_id:'pidp-user',titles:['CEO'],portrait};
  const preview=await runMemberTitlesOperation(d1,identity,args) as {previewId:string};
  await assert.rejects(runMemberTitlesOperation(d1,identity,{...args,portrait:{...portrait,url:'https://example.com/other.jpg'},confirm:true,previewId:preview.previewId}));
  const reviewed=await runMemberTitlesOperation(d1,identity,args) as {previewId:string};
  await runMemberTitlesOperation(d1,identity,{...args,confirm:true,previewId:reviewed.previewId});
  const published=await read('personnel');assert.equal(published.people.length,2);assert.equal(published.people[0].photo_url,portrait.url);assert.equal(published.people[0].photo_source_url,portrait.source_url);
  // Omitting portrait on a title-only change preserves it; null explicitly clears it.
  const titleOnly={organizationId:'org-one',user_id:'pidp-user',titles:['Advisor']};
  const p=await runMemberTitlesOperation(d1,identity,titleOnly) as {previewId:string};await runMemberTitlesOperation(d1,identity,{...titleOnly,confirm:true,previewId:p.previewId});
  assert.equal((await read('board')).people[0].photo_url,portrait.url);
  const clear={...titleOnly,titles:[],portrait:null};const c=await runMemberTitlesOperation(d1,identity,clear) as {previewId:string};await runMemberTitlesOperation(d1,identity,{...clear,confirm:true,previewId:c.previewId});
  assert.equal((await read('personnel')).people.length,1);
  for(const url of ['javascript:alert(1)','http://example.com/p.jpg','https://user:secret@example.com/p.jpg'])await assert.rejects(runMemberTitlesOperation(d1,identity,{...args,portrait:{...portrait,url}}));
  await assert.rejects(runMemberTitlesOperation(d1,identity,{...args,portrait:{url:portrait.url}}));
  assert.equal((await db.prepare("SELECT role FROM organization_memberships WHERE user_id='pidp-user'").first() as {role:string}).role,'owner');
  await db.prepare("UPDATE user_contact_pages SET enabled=0 WHERE user_id='colleague'").run();assert.equal((await read('personnel')).people.length,0);
 }finally{db.close()}
});
