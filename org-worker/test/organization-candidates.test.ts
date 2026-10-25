import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {organizationCandidates} from '../src/organizationCandidates';
test('public candidacies count original active favorites and omit expired, declined, and other organizations',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 try{
  const dir=new URL('../migrations/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(name,dir),'utf8'));
  sqlite.exec(`INSERT INTO organizations(id,name,slug) VALUES('team','Team','team'),('other','Other','other');
   INSERT INTO events(id,ingest_key,slug,title,host_org_id,starts_at) VALUES('demo','demo','demo-day','Demo Day','other','2099-01-01');`);
  const insert=sqlite.prepare("INSERT INTO event_submissions(event_id,submission_id,organization_id,submitted_by,title,summary,status,updated_at,expires_at) VALUES('demo',?,?,'private-user','Pitch','Summary',?,'2026-01-01',?)");
  insert.run('pitch','team','submitted','2099-01-01');insert.run('expired','team','submitted','2000-01-01');insert.run('declined','team','declined','2099-01-01');insert.run('other','other','submitted','2099-01-01');
  const vote=sqlite.prepare("INSERT INTO event_submission_favorites(event_id,user_id,slot,submission_id,created_at,expires_at) VALUES('demo',?,1,'pitch','2026-01-01',?)");
  vote.run('voter-one','2099-01-01');vote.run('voter-two','2099-01-01');vote.run('expired-voter','2000-01-01');
  const db={prepare:(sql:string)=>{const stmt=sqlite.prepare(sql);return {bind:(...values:any[])=>({all:async()=>({results:stmt.all(...values).map(row=>({...row}))})})}}} as unknown as D1Database;
  assert.deepEqual(await organizationCandidates(db,'team'),[{event_id:'demo',event_slug:'demo-day',event_title:'Demo Day',submission_id:'pitch',title:'Pitch',stars:2}]);
  sqlite.exec("DELETE FROM event_submission_favorites WHERE user_id='voter-one'");assert.equal((await organizationCandidates(db,'team'))[0].stars,1);
  sqlite.exec('DELETE FROM event_submission_favorites');assert.equal((await organizationCandidates(db,'team'))[0].stars,0);
  assert.deepEqual(await organizationCandidates(db,'missing'),[]);
 }finally{sqlite.close()}
});
