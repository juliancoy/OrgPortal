import {identityProfile} from './helpers/identityProfile';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readCurrentSchemaFileSync as readFileSync } from './helpers/currentSchema';
import { DatabaseSync } from 'node:sqlite';
import { app } from '../src/index';
function fixture() {
 const sql=new DatabaseSync(':memory:');
 for(const name of ['0001_contact_pages.sql','0004_ledger_ubi.sql','0002_org_event_directories.sql','0009_people_ubi_org_sentiments.sql','0015_organization_iam.sql','0030_organization_feedback.sql','0043_organization_media.sql'])sql.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
 sql.exec('ALTER TABLE events ADD COLUMN event_date TEXT');
 const insert=sql.prepare('INSERT INTO organizations(id,name,slug) VALUES(?,?,?)');
 for(let i=0;i<1200;i++)insert.run(`a-${i}`,`A Popular Organization ${String(i).padStart(4,'0')}`,`a-${i}`);
 insert.run('tedco','TEDCO','tedco');
 const queries: {sql:string;rows:number}[]=[];
 const db={prepare(query:string){const stmt=sql.prepare(query);const bind=(args:any[])=>({bind:(...values:any[])=>bind(values),all:async()=>{const results=stmt.all(...args);queries.push({sql:query,rows:results.length});return {results}},first:async()=>stmt.get(...args)||null});return bind([])}} as unknown as D1Database;
 return {sql,queries,env:{DB:db,PIDP_BASE_URL:'https://local-id.test'} as Env};
}
test('public quick search finds organizations beyond the old candidate cap and paginates after matching',async()=>{
 const {sql,env}=fixture();try{
  for(const limit of [1,5,40]){
   const response=await app.request(`https://local-portal.test/api/network/orgs/public?q=TEDCO&limit=${limit}`,{},env);
   assert.equal(response.status,200);assert.equal((await response.json() as any[])[0].id,'tedco');
  }
  const typo=await app.request('https://local-portal.test/api/network/orgs/public?q=tedc&limit=5',{},env);
  assert.equal((await typo.json() as any[])[0].id,'tedco');
  const browse=await app.request('https://local-portal.test/api/network/orgs/public?limit=5&offset=1200',{},env);
  assert.deepEqual((await browse.json() as any[]).map(r=>r.id),['tedco']);
 }finally{sql.close();}
});
test('authenticated search covers all organizations while an explicit mine filter stays scoped',async t=>{
 const {sql,env}=fixture();t.after(()=>sql.close());
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json(identityProfile({id:'local-member',full_name:'Local member',is_sysadmin:false}));t.after(()=>{globalThis.fetch=original});
 for(const mine of [false,true]){
  const response=await app.request(`https://local-portal.test/api/network/orgs?q=TEDCO&limit=5&mine=${mine}`,{headers:{authorization:'Bearer local-fixture'}},env);
  assert.equal(response.status,200);assert.deepEqual((await response.json() as any[]).map(r=>r.id),mine?[]:['tedco']);
 }
});


test('search enriches only text matches and retains activity ranking and pagination', async t => {
 const {sql,queries,env}=fixture();t.after(()=>sql.close());
 sql.exec("INSERT INTO organizations(id,name,slug) VALUES ('tedco-active','TEDCO','tedco-active')");
 sql.exec("INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES ('tedco-active','member','member','active')");
 const response=await app.request('https://local-portal.test/api/network/orgs/public?q=tedco&limit=1',{},env);
 assert.equal(response.status,200);
 assert.equal((await response.json() as any[])[0].id,'tedco-active');
 assert.equal(queries.find(query=>query.sql.includes('SELECT o.*'))?.rows,2);
 const page=await app.request('https://local-portal.test/api/network/orgs/public?q=tedco&limit=1&offset=1',{},env);
 assert.equal((await page.json() as any[])[0].id,'tedco');
 queries.length=0;
 const empty=await app.request('https://local-portal.test/api/network/orgs/public?q=zzzzzzzz',{},env);
 assert.deepEqual(await empty.json(),[]);
 assert.equal(queries.length,1);
});

test('global search returns event cards without querying per-event details', async t => {
 const {sql,queries,env}=fixture();t.after(()=>sql.close());
 const insert=sql.prepare('INSERT INTO events(id,ingest_key,title,slug,starts_at,host_org_id) VALUES(?,?,?,?,?,?)');
 for(let i=0;i<160;i++)insert.run(`event-${i}`,`event-${i}`,'TEDCO Demo Day',`tedco-demo-${i}`,'2099-01-01T18:00:00Z','tedco');
 sql.exec("INSERT INTO user_contact_pages(id,user_id,user_name,slug,enabled) VALUES ('hidden','hidden','TEDCO Private Person','hidden',0)");
 const get=async(limit:number)=>{
  const response=await app.fetch(new Request(`https://local-portal.test/api/network/search?q=tedco&limit=${limit}`),env,{waitUntil(){},passThroughOnException(){},props:{}} as unknown as ExecutionContext);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  return await response.json() as any;
 };
 const suggestions=await get(5);
 assert.equal(suggestions.events.length,5);
 assert.equal(suggestions.events[0].title,'TEDCO Demo Day');
 assert.equal(suggestions.events[0].host_org_name,'TEDCO');
 assert.deepEqual(suggestions.users,[]);
 assert.deepEqual(suggestions.orgs.map((row:any)=>row.id),['tedco']);
 assert.equal(queries.length,4); // Text match, matching org details, event candidates, visible people.
 const full=await get(40);
 assert.deepEqual(suggestions.events,full.events.slice(0,5));
});
