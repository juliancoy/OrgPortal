import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { HTTPException } from 'hono/http-exception';
import { organizationFollowRoutes,dispatchFollowEventNotifications } from '../src/organizationFollows';

class Database {
 readonly sqlite = new DatabaseSync(':memory:');
 constructor() {
  this.sqlite.exec('PRAGMA foreign_keys=ON');
  const dir = new URL('../migrations/',import.meta.url);
  for (const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort()) this.sqlite.exec(readFileSync(new URL(name,dir),'utf8'));
  this.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('one','One','one'),('two','Two','two')");
 }
 prepare(sql:string) {
  const stmt=this.sqlite.prepare(sql);
  const bound=(values:any[]=[])=>({bind:(...v:any[])=>bound(v),first:async()=>stmt.get(...values)||null,
   all:async()=>({results:stmt.all(...values)}),run:async()=>({meta:stmt.run(...values)})});
  return bound();
 }
 async batch(statements:any[]) {
  this.sqlite.exec('BEGIN');
  try { const results=[]; for(const s of statements) results.push(await s.run()); this.sqlite.exec('COMMIT'); return results; }
  catch(e) { this.sqlite.exec('ROLLBACK'); throw e; }
 }
 asD1(){return this as unknown as D1Database;}
 follow(user:string,org='one',at='2000-01-01T00:00:00.000Z') {
  this.sqlite.prepare('INSERT INTO organization_follows(user_id,organization_id,created_at) VALUES(?,?,?)').run(user,org,at);
 }
 event(id:string,org='one',start='2099-01-01T12:00:00Z') {
  this.sqlite.prepare('INSERT INTO events(id,ingest_key,slug,title,host_org_id,starts_at) VALUES(?,?,?,?,?,?)').run(id,id,id,'Event '+id,org,start);
 }
 rows(sql:string){return this.sqlite.prepare(sql).all();}
}
function fixture() {
 const db=new Database();
 const app=organizationFollowRoutes(async(_env,request)=>{
  const id=request.headers.get('Authorization'); if(!id)throw new HTTPException(401); return {id};
 },async(_env,_request,row)=>({id:row.id,title:row.title,slug:row.slug}));
 return {db,request:(path:string,method='GET',user='alice',body?:unknown)=>app.request(path,{method,
  headers:user?{Authorization:user}: {},...(body?{body:JSON.stringify(body)}:{})},{DB:db.asD1()})};
}

test('follow is idempotent, account-bound, private and separate from membership',async()=>{
 const f=fixture();try {
  assert.equal((await f.request('/orgs/one/follow','PUT','')).status,401);
  assert.equal((await f.request('/orgs/missing/follow','PUT')).status,404);
  assert.equal((await f.request('/orgs/one/follow','PUT','alice',{user_id:'bob'})).status,200);
  await f.request('/orgs/one/follow','PUT');
  assert.equal(f.db.rows('SELECT * FROM organization_follows').length,1);
  assert.equal(f.db.rows('SELECT * FROM organization_memberships').length,0);
  assert.equal((await f.request('/orgs/one/follow')).headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await (await f.request('/orgs/one/follow','GET','bob')).json(),{following:false});
  assert.equal((await (await f.request('/following/orgs','GET','bob')).json() as any[]).length,0);
  await f.request('/orgs/one/follow','DELETE','bob');
  assert.equal(f.db.rows('SELECT * FROM organization_follows').length,1);
  await f.request('/orgs/one/follow','DELETE'); await f.request('/orgs/one/follow','DELETE');
  assert.equal(f.db.rows('SELECT * FROM organization_follows').length,0);
 }finally{f.db.sqlite.close();}
});

test('feed includes existing upcoming events only from current follows; notices have no historic backlog',async()=>{
 const f=fixture();try {
  f.db.event('historic');f.db.follow('alice');f.db.event('new');f.db.event('other','two');f.db.event('past','one','2000-01-01');
  assert.deepEqual((await (await f.request('/following/events')).json() as any[]).map(e=>e.id),['historic','new']);
  assert.deepEqual(await (await f.request('/following/events','GET','bob')).json(),[]);
  await dispatchFollowEventNotifications(f.db.asD1());await dispatchFollowEventNotifications(f.db.asD1());
  const notices=f.db.rows('SELECT * FROM user_notifications');
  assert.equal(notices.length,1);assert.equal(notices[0].entity_id,'new');assert.equal(notices[0].user_id,'alice');
  const id=String(notices[0].id);
  assert.equal((await f.request('/notifications/'+id+'/read','POST','bob')).status,404);
  assert.equal((await f.request('/notifications/'+id+'/read','POST')).status,200);
  assert.equal(f.db.rows('SELECT status FROM user_notifications')[0].status,'read');
  await f.request('/orgs/one/follow','DELETE');
  assert.deepEqual(await (await f.request('/following/events')).json(),[]);
 }finally{f.db.sqlite.close();}
});

test('delivery rechecks unfollows, late follows, host changes and event deletion',async()=>{
 const db=new Database();try {
  db.follow('alice');db.follow('bob');db.event('new');db.event('changed');db.event('deleted');
  db.sqlite.exec("DELETE FROM organization_follows WHERE user_id='alice'; UPDATE events SET host_org_id='two' WHERE id='changed'; DELETE FROM events WHERE id='deleted'");
  db.follow('late','one','2099-01-01T00:00:00.000Z');
  await dispatchFollowEventNotifications(db.asD1());
  assert.deepEqual(db.rows('SELECT user_id,entity_id FROM user_notifications').map(r=>({...r})),[{user_id:'bob',entity_id:'new'}]);
  assert.equal(db.rows('SELECT * FROM organization_follow_event_jobs').length,0);
 }finally{db.sqlite.close();}
});

test('notification fanout is bounded and resumes without duplicates',async()=>{
 const db=new Database();try {
  for(let i=0;i<61;i++)db.follow('u'+String(i).padStart(3,'0'));
  db.event('new');
  await dispatchFollowEventNotifications(db.asD1());assert.equal(db.rows('SELECT * FROM user_notifications').length,50);
  assert.equal(db.rows('SELECT * FROM organization_follow_event_jobs').length,1);
  db.sqlite.exec("UPDATE organization_follow_event_jobs SET last_user_id=''");
  await dispatchFollowEventNotifications(db.asD1());assert.equal(db.rows('SELECT * FROM user_notifications').length,50);
  await dispatchFollowEventNotifications(db.asD1());await dispatchFollowEventNotifications(db.asD1());
  assert.equal(db.rows('SELECT * FROM user_notifications').length,61);
  assert.equal(db.rows('SELECT * FROM organization_follow_event_jobs').length,0);
 }finally{db.sqlite.close();}
});

test('private follows, jobs and notices do not enter immutable journals',async()=>{
 const db=new Database();try {
  db.follow('alice');db.event('new');await dispatchFollowEventNotifications(db.asD1());
  db.sqlite.exec("UPDATE user_notifications SET status='read' WHERE type='organization_event'; DELETE FROM user_notifications WHERE type='organization_event'; DELETE FROM organization_follows");
  assert.equal(db.rows("SELECT * FROM change_journal WHERE table_name IN ('organization_follows','organization_follow_event_jobs','user_notifications')").length,0);
  db.sqlite.exec("INSERT INTO user_notifications(id,user_id,type,title,body,created_at) VALUES('other','alice','connection_request','Connect','Request',CURRENT_TIMESTAMP)");
  assert.equal(db.rows("SELECT * FROM change_journal WHERE table_name='user_notifications'").length,1);
 }finally{db.sqlite.close();}
});
