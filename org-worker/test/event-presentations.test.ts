import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { HTTPException } from 'hono/http-exception';
import { presentationRoutes } from '../src/eventPresentations';
class Database {
 readonly sqlite = new DatabaseSync(':memory:');
 constructor() {
  this.sqlite.exec('PRAGMA foreign_keys=ON');
  const dir = new URL('../migrations/',import.meta.url);
  for (const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort()) this.sqlite.exec(readFileSync(new URL(name,dir),'utf8'));
  this.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('one','One','one'),('two','Two','two'),('team','Team','team')");
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

function fixture(){
 const db=new Database();db.event('event','one');
 db.sqlite.exec("INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES('one','host','owner','active'),('team','applicant','owner','active'),('team','member','member','active')");
 const app=presentationRoutes(async(_env,req)=>{const id=req.headers.get('Authorization');if(!id)throw new HTTPException(401);return {id};});
 app.onError((error,c)=>c.json({message:error.message},(error as any).status||500));
 return {db,request:(suffix='',method='GET',user='applicant',body?:unknown)=>app.request('/event/presentations'+suffix,{method,headers:{Authorization:user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},{DB:db.asD1()})};
}
test('management, isolation, review, closing, expiry and withdrawal',async()=>{
 const f=fixture();try{
 const proposal={title:'Our demo',summary:'A medical device prototype'};
 assert.equal((await f.request('/team','PUT','applicant',proposal)).status,409);
 assert.equal((await f.request('/form','PUT','applicant',{enabled:true})).status,403);
 assert.equal((await f.request('/form','PUT','host',{enabled:true})).status,200);
 assert.equal((await f.request('/team','PUT','member',proposal)).status,403);
 assert.equal((await f.request('/team','PUT','stranger',proposal)).status,403);
 assert.equal((await f.request('/team','PUT','applicant',proposal)).status,200);
 assert.equal((await f.request('/team','PUT','applicant',proposal)).status,200);
 assert.equal(f.db.rows('SELECT * FROM event_presentation_submissions').length,1);
 assert.equal((await (await f.request('','GET','stranger')).json() as any).submissions.length,0);
 assert.equal((await (await f.request('','GET','host')).json() as any).submissions.length,1);
 assert.equal((await f.request('/team','PATCH','applicant',{status:'accepted'})).status,403);
 assert.equal((await f.request('/team','PATCH','host',{status:'accepted'})).status,200);
 await f.request('/form','PUT','host',{enabled:false});
 assert.equal((await f.request('/team','PUT','applicant',proposal)).status,409);
 f.db.sqlite.exec("UPDATE event_presentation_submissions SET expires_at='2000-01-01T00:00:00.000Z'");
 assert.equal((await (await f.request('','GET','host')).json() as any).submissions.length,0);
 assert.equal((await f.request('/team','DELETE','stranger')).status,403);
 assert.equal((await f.request('/team','DELETE','applicant')).status,200);
 assert.equal(f.db.rows('SELECT * FROM event_presentation_submissions').length,0);
 }finally{f.db.sqlite.close();}
});
test('deadline and invalid proposals',async()=>{
 const f=fixture();try{
 await f.request('/form','PUT','host',{enabled:true});
 assert.equal((await f.request('/team','PUT','applicant',{title:'',summary:'x'})).status,400);
 f.db.sqlite.exec("UPDATE events SET starts_at='2000-01-01T00:00:00Z'");
 assert.equal((await f.request('/team','PUT','applicant',{title:'Demo',summary:'Details'})).status,409);
 }finally{f.db.sqlite.close();}
});
test('manager review paginates beyond 200 with counts, filters, stable ties and complete CSV',async()=>{
 const f=fixture();try{
  const org=f.db.sqlite.prepare('INSERT INTO organizations(id,name,slug) VALUES(?,?,?)');
  const submission=f.db.sqlite.prepare("INSERT INTO event_presentation_submissions(event_id,organization_id,submitted_by,title,summary,status,updated_at,expires_at) VALUES('event',?,'applicant',?,?,?,'2026-01-01T00:00:00Z','2100-01-01T00:00:00Z')");
  for(let i=0;i<207;i++){const id='fixture-'+String(i).padStart(3,'0');org.run(id,'Team '+i,id);submission.run(id,i===0?'=HYPERLINK("bad")':'Demo '+i,'Details, including "quotes"\nand another line',i<3?'accepted':'submitted')}
  f.db.sqlite.prepare("UPDATE event_presentation_submissions SET expires_at='2000-01-01' WHERE organization_id='fixture-206'").run();
  assert.equal((await f.request('/review','GET','applicant')).status,403);
  assert.equal((await f.request('/export','GET','applicant')).status,403);
  const review=await(await f.request('/review','GET','host')).json() as any;
  assert.equal(review.total,206);assert.equal(review.counts.accepted,3);assert.equal(review.counts.submitted,203);assert.equal(review.pages,9);assert.equal(review.submissions.length,25);
  const ids=new Set<string>();for(let page=1;page<=9;page++){const data=await(await f.request('/review?page='+page,'GET','host')).json() as any;for(const row of data.submissions){assert.ok(!ids.has(row.organization_id));ids.add(row.organization_id)}}assert.equal(ids.size,206);
  const filtered=await(await f.request('/review?status=accepted','GET','host')).json() as any;assert.equal(filtered.total,3);assert.equal(filtered.counts.all,206);
  assert.equal((await f.request('/review?status=unknown','GET','host')).status,400);
  assert.equal((await f.request('/review?page=-1','GET','host')).status,400);
  const last=await(await f.request('/review?page=999','GET','host')).json() as any;assert.equal(last.page,9);assert.equal(last.submissions.length,6);
  const csv=await f.request('/export','GET','host');assert.match(csv.headers.get('Content-Type')!,/text\/csv/);const text=await csv.text();
  assert.ok(text.includes('fixture-205'));assert.ok(!text.includes('fixture-206'));assert.ok(text.includes('"\'=HYPERLINK(""bad"")"'));assert.ok(text.includes('including ""quotes""\nand another line'));
  const accepted=await(await f.request('/export?status=accepted','GET','host')).text();assert.ok(accepted.includes('fixture-002'));assert.ok(!accepted.includes('fixture-003'));
  f.db.sqlite.exec("UPDATE organization_memberships SET status='inactive' WHERE user_id='host'");assert.equal((await f.request('/review','GET','host')).status,403);assert.equal((await f.request('/export','GET','host')).status,403);
 }finally{f.db.sqlite.close()}
});
