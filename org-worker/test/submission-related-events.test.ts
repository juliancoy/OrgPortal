import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';

const migrations=new URL('../migrations/',import.meta.url);
const migration='0126_submission_related_events.sql';
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const name of readdirSync(migrations).filter(name=>name.endsWith('.sql')&&name<migration).sort())db.exec(readFileSync(new URL(name,migrations),'utf8'));
 db.exec(`INSERT INTO organizations(id,name,slug) VALUES('team','Team','team'),('other','Other','other');
 INSERT INTO events(id,ingest_key,slug,title) VALUES('demo','demo','demo','Demo day'),('elsewhere','elsewhere','elsewhere','Other event');`);
 return db;
}
function submit(db:DatabaseSync,id:string,event='demo',org='team'){
 db.prepare(`INSERT INTO event_submissions(event_id,submission_id,organization_id,submitted_by,title,summary,status,updated_at,expires_at)
 VALUES(?,?,?,'applicant','Talk','Summary','declined','2000-01-01','2000-02-01')`).run(event,id,org);
}
function guest(db:DatabaseSync,id:string,org:string|null){
 db.prepare(`INSERT INTO event_guest_presentations(id,event_id,contact_name,email,organization_name,title,summary,created_at,expires_at,organization_id)
 VALUES(?,'demo','Guest','guest@example.test','Other','Talk','Summary','2000-01-01','2000-02-01',?)`).run(id,org);
}
function links(db:DatabaseSync){return db.prepare('SELECT event_id,organization_id FROM event_organizations ORDER BY event_id,organization_id').all().map(row=>({...row}));}
function apply(db:DatabaseSync){db.exec(readFileSync(new URL(migration,migrations),'utf8'));}

test('backfill includes past, expired and declined submissions and linked guests without guessing organization names',()=>{
 const db=fixture();try{
  submit(db,'past');submit(db,'duplicate');guest(db,'linked','team');guest(db,'unclaimed',null);
  db.exec("INSERT INTO event_organizations VALUES('elsewhere','other')");apply(db);
  assert.deepEqual(links(db),[{event_id:'demo',organization_id:'team'},{event_id:'elsewhere',organization_id:'other'}]);
 }finally{db.close();}
});
test('future submissions and guest claims link their event and organization, retain history and deduplicate retries',()=>{
 const db=fixture();try{
  apply(db);submit(db,'one');submit(db,'two');
  assert.deepEqual(links(db),[{event_id:'demo',organization_id:'team'}]);
  guest(db,'unclaimed',null);assert.equal(links(db).length,1);
  db.exec("UPDATE event_guest_presentations SET organization_id='other' WHERE id='unclaimed'");
  guest(db,'already-linked','other');assert.equal(links(db).length,2);
  submit(db,'separate','elsewhere','other');
  db.exec("UPDATE event_submissions SET title='Edited' WHERE submission_id='one'; DELETE FROM event_submissions WHERE submission_id IN ('one','two')");
  assert.deepEqual(links(db),[{event_id:'demo',organization_id:'other'},{event_id:'demo',organization_id:'team'},{event_id:'elsewhere',organization_id:'other'}]);
  db.exec("DELETE FROM events WHERE id='demo'");
  assert.deepEqual(links(db),[{event_id:'elsewhere',organization_id:'other'}]);
 }finally{db.close();}
});
