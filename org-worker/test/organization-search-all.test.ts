import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { app } from '../src/index';
function fixture() {
 const sql=new DatabaseSync(':memory:');
 for(const name of ['0001_contact_pages.sql','0004_ledger_ubi.sql','0002_org_event_directories.sql','0009_people_ubi_org_sentiments.sql','0015_organization_iam.sql','0030_organization_feedback.sql','0043_organization_media.sql'])sql.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
 sql.exec('ALTER TABLE events ADD COLUMN event_date TEXT');
 const insert=sql.prepare('INSERT INTO organizations(id,name,slug) VALUES(?,?,?)');
 for(let i=0;i<1200;i++)insert.run(`a-${i}`,`A Popular Organization ${String(i).padStart(4,'0')}`,`a-${i}`);
 insert.run('tedco','TEDCO','tedco');
 const db={prepare(query:string){const stmt=sql.prepare(query);const bind=(args:any[])=>({bind:(...values:any[])=>bind(values),all:async()=>({results:stmt.all(...args)}),first:async()=>stmt.get(...args)||null});return bind([])}} as unknown as D1Database;
 return {sql,env:{DB:db,PIDP_BASE_URL:'https://local-id.test'} as Env};
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
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({id:'local-member',full_name:'Local member',is_sysadmin:false});t.after(()=>{globalThis.fetch=original});
 for(const mine of [false,true]){
  const response=await app.request(`https://local-portal.test/api/network/orgs?q=TEDCO&limit=5&mine=${mine}`,{headers:{authorization:'Bearer local-fixture'}},env);
  assert.equal(response.status,200);assert.deepEqual((await response.json() as any[]).map(r=>r.id),mine?[]:['tedco']);
 }
});
