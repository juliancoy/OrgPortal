import { runPresentationOperation } from '../src/presentationMcp';
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
function finalCandidates(db:Database) {
 const insert=db.sqlite.prepare("INSERT INTO event_submissions(event_id,submission_id,organization_id,submitted_by,title,summary,status,updated_at,expires_at) VALUES('event',?,?,'applicant',?,'Details','submitted','2026-01-01','2099-04-01')");
 insert.run('final-a','team','Demo A');insert.run('final-b','two','Demo B');insert.run('final-c','one','Demo C');
}
test('final round host controls, immutable shortlist, tenant isolation and private single-choice ballots',async()=>{
 const f=fixture();try{
  finalCandidates(f.db);
  const round={phase:'shortlist',finalistIds:['final-a','final-b']};
  assert.equal((await f.request('/final-round','PUT','applicant',round)).status,403);
  assert.equal((await f.request('/final-round','PUT','stranger',round)).status,403);
  assert.equal((await f.request('/final-round','PUT','',round)).status,401);
  for(const finalistIds of [[],['final-a','final-a'],['missing'],Array.from({length:21},(_,i)=>String(i))])assert.equal((await f.request('/final-round','PUT','host',{...round,finalistIds})).status,finalistIds[0]==='missing'?409:400);
  f.db.event('elsewhere','two');
  f.db.sqlite.exec("INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES('two','other-host','owner','active'); INSERT INTO event_submissions(event_id,submission_id,organization_id,submitted_by,title,summary,status,updated_at,expires_at) VALUES('elsewhere','foreign','team','applicant','Foreign','Details','submitted','2026-01-01','2099-04-01')");
  assert.equal((await f.request('/final-round','PUT','other-host',round)).status,403);
  assert.equal((await f.request('/final-round','PUT','host',{...round,finalistIds:['foreign']})).status,409);
  assert.equal((await f.request('/final-round','PUT','host',{...round,phase:'closed'})).status,409);
  assert.equal((await f.request('/final-round','PUT','host',round)).status,200);
  assert.equal((await f.request('/final-ballot','PUT','voter',{submissionId:'final-a'})).status,409);
  assert.equal((await f.request('/final-round','PUT','host',{...round,phase:'open'})).status,200);
  assert.equal((await f.request('/final-round','PUT','host',{...round,phase:'open',finalistIds:['final-a','final-c']})).status,409);
  assert.equal((await f.request('/final-round','PUT','host',round)).status,409);
  assert.equal((await f.request('/final-ballot','PUT','',{submissionId:'final-a'})).status,401);
  assert.equal((await f.request('/final-ballot','PUT','voter',{submissionId:'final-c'})).status,409);
  assert.equal((await f.request('/final-ballot','PUT','voter',{submissionId:'final-a',userId:'another'})).status,400);
  for(let n=0;n<2;n++)assert.equal((await f.request('/final-ballot','PUT','voter',{submissionId:'final-a'})).status,200);
  assert.equal(f.db.rows('SELECT * FROM event_presentation_final_ballots').length,1);
  assert.equal((await f.request('/final-ballot','GET','')).status,401);
  assert.deepEqual(await (await f.request('/final-ballot','GET','other')).json(),{submissionId:null});
  assert.deepEqual(await (await f.request('/final-ballot','GET','voter')).json(),{submissionId:'final-a'});
  assert.equal((await f.request('/final-ballot','PUT','voter',{submissionId:'final-b'})).status,200);
  assert.equal(f.db.rows('SELECT * FROM event_presentation_final_ballots').length,1);
  const publicRound=await(await f.request('/final-round','GET','')).json() as any;
  assert.equal(publicRound.results[0].submission_id,'final-b');assert.equal(publicRound.results[0].votes,1);
  assert.equal(JSON.stringify(publicRound).includes('voter'),false);
  assert.equal((await f.request('/final-round','PUT','host',{...round,phase:'closed'})).status,200);
  assert.equal((await f.request('/final-ballot','PUT','voter',{submissionId:'final-a'})).status,409);
  assert.deepEqual(await (await f.request('/final-ballot','GET','voter')).json(),{submissionId:'final-b'});
  assert.equal((await f.request('/final-round','PUT','host',{...round,phase:'open'})).status,200);
 }finally{f.db.sqlite.close();}
});
test('final votes do not reuse favorites; live totals handle ties, withdrawal and expiry',async()=>{
 const f=fixture();try{
  finalCandidates(f.db);
  await f.request('/favorites/final-a','PUT','voter',{selected:true});
  const round={phase:'open',finalistIds:['final-a','final-b']};
  assert.equal((await f.request('/final-round','PUT','host',round)).status,200);
  let data=await(await f.request('/final-round','GET','')).json() as any;
  assert.equal(data.results.reduce((sum:number,row:any)=>sum+row.votes,0),0);
  await Promise.all(['final-a','final-b'].map(submissionId=>f.request('/final-ballot','PUT','voter',{submissionId})));
  assert.equal(f.db.rows('SELECT * FROM event_presentation_final_ballots').length,1);
  await f.request('/final-ballot','PUT','voter',{submissionId:'final-a'});
  await f.request('/final-ballot','PUT','second-voter',{submissionId:'final-b'});
  data=await(await f.request('/final-round','GET','')).json() as any;
  assert.deepEqual(data.results.map((row:any)=>row.votes),[1,1]);
  assert.equal((await(await f.request('/favorites','GET','voter')).json() as any).favorites[0],'final-a');
  f.db.sqlite.exec("DELETE FROM event_submissions WHERE submission_id='final-a'");
  assert.equal(f.db.rows('SELECT * FROM event_presentation_final_ballots').length,1);
  assert.equal((await f.request('/final-round','PUT','host',{...round,phase:'closed'})).status,200);
  data=await(await f.request('/final-round','GET','')).json() as any;
  assert.equal(data.results.length,1);assert.equal(data.results[0].submission_id,'final-b');
  f.db.sqlite.exec("UPDATE event_presentation_final_rounds SET expires_at='2000-01-01'; UPDATE event_presentation_final_ballots SET expires_at='2000-01-01'");
  assert.deepEqual((await(await f.request('/final-round','GET','')).json() as any).results,[]);
  assert.deepEqual(await(await f.request('/final-ballot','GET','second-voter')).json(),{submissionId:null});
  assert.equal((await f.request('/final-ballot','PUT','voter',{submissionId:'final-b'})).status,409);
  f.db.sqlite.exec("DELETE FROM events WHERE id='event'");
  assert.equal(f.db.rows('SELECT * FROM event_presentation_final_rounds').length,0);
  assert.equal(f.db.rows('SELECT * FROM event_presentation_final_ballots').length,0);
 }finally{f.db.sqlite.close();}
});
test('management, isolation, review, closing, expiry and withdrawal',async()=>{
 const f=fixture();try{
 const proposal={title:'Our demo',summary:'A medical device prototype',presenters:[{userId:'member'}]};
 assert.equal((await f.request('/team','PUT','applicant',proposal)).status,409);
 assert.equal((await f.request('/form','PUT','applicant',{enabled:true})).status,403);
 assert.equal((await f.request('/form','PUT','host',{enabled:true})).status,200);
 assert.equal((await f.request('/team','PUT','member',proposal)).status,403);
 assert.equal((await f.request('/team','PUT','stranger',proposal)).status,403);
 assert.equal((await f.request('/team','PUT','applicant',proposal)).status,200);
 assert.equal((await f.request('/team','PUT','applicant',proposal)).status,200);
 assert.equal(f.db.rows('SELECT * FROM event_submissions').length,1);
 assert.equal((await (await f.request('','GET','stranger')).json() as any).submissions.length,0);
 assert.equal((await (await f.request('','GET','host')).json() as any).submissions.length,1);
 assert.equal((await f.request('/team','PATCH','applicant',{status:'accepted'})).status,403);
 assert.equal((await f.request('/team','PATCH','host',{status:'accepted'})).status,200);
 await f.request('/form','PUT','host',{enabled:false});
 assert.equal((await f.request('/team','PUT','applicant',proposal)).status,200);
 f.db.sqlite.exec("UPDATE event_submissions SET expires_at='2000-01-01T00:00:00.000Z'");
 assert.equal((await (await f.request('','GET','host')).json() as any).submissions.length,0);
 assert.equal((await f.request('/team','DELETE','stranger')).status,403);
 assert.equal((await f.request('/team','DELETE','applicant')).status,200);
 assert.equal(f.db.rows('SELECT * FROM event_submissions').length,0);
 }finally{f.db.sqlite.close();}
});
test('deadline and invalid proposals',async()=>{
 const f=fixture();try{
 await f.request('/form','PUT','host',{enabled:true});
 assert.equal((await f.request('/team','PUT','applicant',{title:'',summary:'x'})).status,400);
 f.db.sqlite.exec("UPDATE events SET starts_at='2000-01-01T00:00:00Z'");
 assert.equal((await f.request('/team','PUT','applicant',{title:'Demo',summary:'Details',presenters:[{userId:'member'}]})).status,409);
 }finally{f.db.sqlite.close();}
});
test('manager review paginates beyond 200 with counts, filters, stable ties and complete CSV',async()=>{
 const f=fixture();try{
  const org=f.db.sqlite.prepare('INSERT INTO organizations(id,name,slug) VALUES(?,?,?)');
  const submission=f.db.sqlite.prepare("INSERT INTO event_presentation_submissions(event_id,organization_id,submitted_by,title,summary,status,updated_at,expires_at) VALUES('event',?,'applicant',?,?,?,'2026-01-01T00:00:00Z','2100-01-01T00:00:00Z')");
  for(let i=0;i<207;i++){const id='fixture-'+String(i).padStart(3,'0');org.run(id,'Team '+i,id);submission.run(id,i===0?'=HYPERLINK("bad")':'Demo '+i,'Details, including "quotes"\nand another line',i<3?'accepted':'submitted')}
  f.db.sqlite.prepare("UPDATE event_submissions SET expires_at='2000-01-01' WHERE organization_id='fixture-206'").run();
  const publicIds=new Set<string>();let cursor:string|null=null;
  do{const page=await(await f.request('/submissions'+(cursor?'?after='+encodeURIComponent(cursor):''),'GET','')).json() as {submissions:{organization_id:string}[];next:string|null};for(const row of page.submissions){assert.ok(!publicIds.has(row.organization_id));publicIds.add(row.organization_id)}cursor=page.next}while(cursor);
  assert.equal(publicIds.size,206);
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

test('public submissions omit private fields and favorites are private, capped at three, removable and cascading',async()=>{
 const f=fixture();try{
  for(let n=0;n<4;n++){
   const id=n?'demo-'+n:'team';
   if(n)f.db.sqlite.prepare('INSERT INTO organizations(id,name,slug) VALUES(?,?,?)').run(id,id,id);
   f.db.sqlite.prepare("INSERT INTO event_presentation_submissions VALUES('event',?,'private-submitter','Demo '||?,'Public summary','submitted','2026-01-01','2099-06-01')").run(id,n);
  }
  const publicResponse=await f.request('/submissions','GET','');assert.equal(publicResponse.status,200);
  const listing=await publicResponse.json() as {submissions:Record<string,unknown>[]};assert.equal(listing.submissions.length,4);
  assert.ok(!JSON.stringify(listing).includes('private-submitter'));assert.ok(!('submitted_by' in listing.submissions[0]));
  assert.equal((await f.request('/favorites','GET','')).status,401);
  for(const id of ['team','demo-1','demo-2'])assert.equal((await f.request('/favorites/'+id,'PUT','guest',{selected:true})).status,200);
  assert.equal((await f.request('/favorites/demo-3','PUT','guest',{selected:true})).status,409);
  assert.equal((await f.request('/favorites/team','PUT','guest',{selected:true})).status,200);
  assert.equal((await (await f.request('/favorites','GET','guest')).json() as {favorites:string[]}).favorites.length,3);
  assert.deepEqual((await (await f.request('/favorites','GET','other')).json() as {favorites:string[]}).favorites,[]);
  assert.equal((await f.request('/favorites/demo-3','PUT','other',{selected:true})).status,200);
  assert.equal((await f.request('/favorites/demo-3','PUT','guest',{selected:true,user_id:'other'})).status,400);
  assert.equal((await f.request('/favorites/team','PUT','guest',{selected:false})).status,200);
  assert.equal((await f.request('/favorites/demo-3','PUT','guest',{selected:true})).status,200);
  const counts=await (await f.request('/submissions','GET','')).json() as {submissions:{organization_id:string;favorites:number}[]};assert.equal(counts.submissions.find(row=>row.organization_id==='demo-3')?.favorites,2);
  assert.throws(()=>f.db.sqlite.prepare("INSERT INTO event_presentation_favorites VALUES('event','guest',101,'team','2026-01-01','2099-06-01')").run(),/CHECK/);
  f.db.sqlite.exec("DELETE FROM event_presentation_submissions WHERE organization_id='demo-3'");
  assert.equal(f.db.rows("SELECT * FROM event_presentation_favorites WHERE organization_id='demo-3'").length,0);
  f.db.sqlite.exec("UPDATE event_submissions SET expires_at='2000-01-01'");
  assert.equal((await (await f.request('/submissions','GET','')).json() as {submissions:unknown[]}).submissions.length,0);
  assert.equal((await f.request('/favorites/team','PUT','guest',{selected:true})).status,409);
 }finally{f.db.sqlite.close()}
});

test('event managers configure the limit; lowering never silently removes existing favorites',async()=>{
 const f=fixture();try{
  for(let n=0;n<5;n++){
   const id='choice-'+n;f.db.sqlite.prepare('INSERT INTO organizations(id,name,slug) VALUES(?,?,?)').run(id,id,id);
   f.db.sqlite.prepare("INSERT INTO event_presentation_submissions VALUES('event',?,'applicant','Demo','Details','submitted','2026-01-01','2099-06-01')").run(id);
  }
  assert.equal((await f.request('/settings','PUT','applicant',{favoriteLimit:4})).status,403);
  for(const favoriteLimit of [0,101,1.5])assert.equal((await f.request('/settings','PUT','host',{favoriteLimit})).status,400);
  assert.equal((await f.request('/settings','PUT','host',{favoriteLimit:4})).status,200);
  assert.equal((await(await f.request('/submissions','GET','')).json() as {favoriteLimit:number}).favoriteLimit,4);
  for(let n=0;n<4;n++)assert.equal((await f.request('/favorites/choice-'+n,'PUT','voter',{selected:true})).status,200);
  assert.equal((await f.request('/favorites/choice-4','PUT','voter',{selected:true})).status,409);
  assert.equal((await f.request('/settings','PUT','host',{favoriteLimit:3})).status,409);
  assert.equal((await(await f.request('/favorites','GET','voter')).json() as {favorites:string[]}).favorites.length,4);
  await f.request('/favorites/choice-0','PUT','voter',{selected:false});
  assert.equal((await f.request('/settings','PUT','host',{favoriteLimit:3})).status,200);
 }finally{f.db.sqlite.close()}
});

test('configurable-limit migration preserves existing favorites and defaults existing events to three',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE events(id TEXT PRIMARY KEY);
   CREATE TABLE event_presentation_forms(event_id TEXT PRIMARY KEY,enabled INTEGER);
   CREATE TABLE event_presentation_submissions(event_id TEXT,organization_id TEXT,PRIMARY KEY(event_id,organization_id));
   CREATE TABLE change_journal_exclusions(table_name TEXT PRIMARY KEY,reason TEXT);
   INSERT INTO events VALUES('event');INSERT INTO event_presentation_forms VALUES('event',1);INSERT INTO event_presentation_submissions VALUES('event','team');`);
  db.exec(readFileSync(new URL('../migrations/0096_presentation_favorites.sql',import.meta.url),'utf8'));
  db.exec("INSERT INTO event_presentation_favorites VALUES('event','voter',3,'team','2026-01-01','2099-01-01')");
  db.exec(readFileSync(new URL('../migrations/0097_presentation_favorite_limits.sql',import.meta.url),'utf8'));
  assert.equal(db.prepare('SELECT favorite_limit FROM event_presentation_forms').get()!.favorite_limit,3);
  assert.equal(db.prepare('SELECT slot FROM event_presentation_favorites').get()!.slot,3);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  db.exec("DELETE FROM event_presentation_submissions");assert.equal(db.prepare('SELECT COUNT(*) AS n FROM event_presentation_favorites').get()!.n,0);
 }finally{db.close()}
});

test('one person can create multiple entries for the same team and edit them independently after intake closes',async()=>{
 const f=fixture();try{
  await f.request('/form','PUT','host',{enabled:true});
  const first=crypto.randomUUID(),second=crypto.randomUUID();
  for(const [id,title] of [[first,'First'],[second,'Second']])assert.equal((await f.request('/'+id,'PUT','applicant',{organization_id:'team',title,summary:'Details '+title,presenters:[{userId:'member'}]})).status,200);
  assert.equal((await f.request('/'+first,'PUT','applicant',{organization_id:'team',title:'First',summary:'Details First'})).status,200);
  assert.equal(f.db.rows('SELECT * FROM event_submissions').length,2,'retry must not create another entry');
  await f.request('/favorites/'+first,'PUT','voter',{selected:true});await f.request('/favorites/'+second,'PUT','voter',{selected:true});
  await f.request('/'+first,'PATCH','host',{status:'accepted'});
  await f.request('/form','PUT','host',{enabled:false});
  assert.equal((await f.request('/'+first,'PUT','stranger',{title:'Hijacked',summary:'No'})).status,403);
  assert.equal((await f.request('/'+first,'PUT','applicant',{title:'First edited',summary:'Revised details'})).status,200);
  assert.equal((await f.request('/'+crypto.randomUUID(),'PUT','applicant',{organization_id:'team',title:'Third',summary:'Closed',presenters:[{userId:'member'}]})).status,409);
  const rows=(await(await f.request()).json() as any).submissions;
  assert.equal(rows.find((r:any)=>r.submission_id===first).status,'submitted');
  assert.equal(rows.find((r:any)=>r.submission_id===second).title,'Second');
  assert.equal((await(await f.request('/favorites','GET','voter')).json() as any).favorites.length,2);
  await f.request('/'+first,'DELETE','applicant');
  assert.deepEqual((await(await f.request('/favorites','GET','voter')).json() as any).favorites,[second]);
  assert.equal((await(await f.request('/submissions','GET','')).json() as any).submissions[0].submission_id,second);
 }finally{f.db.sqlite.close()}
});

test('multiple-submission migration preserves legacy entries, favorites and attachment targets during rolling deployment',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec('PRAGMA foreign_keys=ON');const dir=new URL('../migrations/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')&&n<'0099').sort())db.exec(readFileSync(new URL(name,dir),'utf8'));
  db.exec(`INSERT INTO organizations(id,name,slug) VALUES('team','Team','team');
   INSERT INTO events(id,ingest_key,slug,title,host_org_id,starts_at) VALUES('event','event','event','Event','team','2099-01-01');
   INSERT INTO event_presentation_submissions VALUES('event','team','author','Demo','Details','accepted','2026-01-01','2099-06-01');
   INSERT INTO event_presentation_favorites VALUES('event','voter',3,'team','2026-01-01','2099-06-01');
   INSERT INTO event_presentation_attachments VALUES('file','event','team','deck.pdf','application/pdf',10,'hash','submission-attachments/file','ready','2026-01-01','2099-06-01');`);
  db.exec(readFileSync(new URL('../migrations/0099_multiple_submissions.sql',import.meta.url),'utf8'));
  assert.equal(db.prepare('SELECT submission_id FROM event_submissions').get()!.submission_id,'team');
  assert.equal(db.prepare('SELECT slot FROM event_submission_favorites').get()!.slot,3);
  assert.equal(db.prepare('SELECT submission_id FROM event_presentation_attachments').get()!.submission_id,'team');
  db.exec("UPDATE event_presentation_submissions SET title='Changed by old worker'");
  assert.equal(db.prepare('SELECT title FROM event_submissions').get()!.title,'Changed by old worker');
  db.exec('DELETE FROM event_presentation_favorites');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM event_submission_favorites').get()!.n,0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close()}
});

test('submissions share all organization members including their manager',async()=>{
 const f=fixture();try{
  await f.request('/form','PUT','host',{enabled:true});const id=crypto.randomUUID();
  assert.equal((await f.request('/'+id,'PUT','applicant',{organization_id:'team',title:'Their demo',summary:'I manage this team for others',presenters:[{userId:'member'}]})).status,200);
  let publicRows=(await(await f.request('/submissions','GET','')).json() as any).submissions;
  assert.deepEqual(publicRows[0].presenters,[{name:'Team member'},{name:'Team member'}]);
  assert.ok(!JSON.stringify(publicRows).includes('applicant'));assert.ok(!JSON.stringify(publicRows).includes('userId'));
  assert.equal(f.db.rows("SELECT role FROM organization_memberships WHERE user_id='applicant'")[0].role,'owner');
  assert.equal((await f.request('/'+id,'PUT','applicant',{title:'Edited for them',summary:'Still managing'})).status,200);
  assert.deepEqual((await(await f.request()).json() as any).submissions[0].presenters.map((person:any)=>person.userId).sort(),['applicant','member']);
  assert.equal((await f.request('/'+id,'PUT','applicant',{title:'No outsider',summary:'Details',presenters:[{userId:'stranger'}]})).status,400);
  assert.equal((await f.request('/'+id,'PUT','applicant',{title:'Bad data',summary:'Details',presenters:[{userId:'member',name:'Spoofed'}]})).status,400);
  assert.equal((await f.request('/'+id,'PUT','applicant',{title:'Both presenting',summary:'Details',presenters:[{userId:'applicant'},{userId:'member'}]})).status,200);
  publicRows=(await(await f.request('/submissions','GET','')).json() as any).submissions;assert.equal(publicRows[0].presenters.length,2);
  assert.equal((await f.request('/'+id,'PUT','member',{title:'No rights',summary:'Details',presenters:[]})).status,403);
 }finally{f.db.sqlite.close()}
});

test('invited presenters expose no email publicly and resolve only through verified invitation acceptance',async()=>{
 const f=fixture();try{
  await f.request('/form','PUT','host',{enabled:true});const id=crypto.randomUUID(),invite=crypto.randomUUID(),now=Date.now();
  f.db.sqlite.prepare("INSERT INTO organization_invitations(id,organization_id,email,purpose,invited_by,created_at,expires_at) VALUES(?,'team','private@example.test','member','applicant',?,?)").run(invite,now,now+86400000);
  assert.equal((await f.request('/'+id,'PUT','applicant',{organization_id:'team',title:'Invited demo',summary:'Details',presenters:[{invitationId:invite}]})).status,200);
  let listing=await(await f.request('/submissions','GET','')).json() as any;
  assert.deepEqual(listing.submissions[0].presenters,[{name:'Team member'},{name:'Team member'},{name:'Invited teammate',pending:true}]);assert.ok(!JSON.stringify(listing).includes('private@example.test'));
  assert.equal((await(await f.request()).json() as any).submissions[0].presenters.find((person:any)=>person.invitationId===invite).email,'private@example.test');
  f.db.sqlite.exec("INSERT INTO organization_memberships(organization_id,user_id,user_name,role,status) VALUES('team','canonical-recipient','Recipient','member','active')");
  f.db.sqlite.prepare("UPDATE organization_invitations SET status='accepted',accepted_user_id='canonical-recipient' WHERE id=?").run(invite);
  const references=JSON.parse(String(f.db.rows('SELECT presenters_json FROM event_submissions')[0].presenters_json));assert.deepEqual(references,[{userId:'canonical-recipient'}]);
  f.db.sqlite.prepare('DELETE FROM organization_invitations WHERE id=?').run(invite);
  listing=await(await f.request('/submissions','GET','')).json() as any;assert.equal(listing.submissions[0].presenters.length,3);assert.ok(listing.submissions[0].presenters.some((person:any)=>person.name==='Recipient'));
  assert.equal((await f.request('/'+id,'PUT','applicant',{title:'Foreign invite',summary:'Details',presenters:[{invitationId:'missing'}]})).status,400);
 }finally{f.db.sqlite.close()}
});


test('applications use the shared team without requiring a separate presenter selection',async()=>{
 const f=fixture();try{
  await f.request('/form','PUT','host',{enabled:true});
  const proposal={title:'Demo',summary:'Details'};
  assert.equal((await f.request('/team','PUT','applicant',proposal)).status,200);
  assert.equal((await f.request('/team','PUT','applicant',{...proposal,presenters:[]})).status,400);
  assert.equal((await f.request('/team','PUT','applicant',{...proposal,presenters:[{userId:'member'}]})).status,200);
  assert.equal((await f.request('/team','PUT','applicant',{...proposal,presenters:[]})).status,400);
  f.db.sqlite.exec("UPDATE event_submissions SET presenters_json='[]'");
  assert.equal((await f.request('/team','PUT','applicant',proposal)).status,200);
 }finally{f.db.sqlite.close()}
});

test('MCP applications preserve permission and host boundaries, reviewed receipts and private email invitations',async()=>{
 const f=fixture();try{
  await f.request('/form','PUT','host',{enabled:true});
  const env={DB:f.db.asD1()} as Env;
  const identity={userId:'applicant',scopes:['org:events.read','org:events.write','org:portal.read','org:portal.write']};
  const args={organizationId:'one',eventId:'event',teamOrganizationId:'team',submissionId:crypto.randomUUID(),title:'MCP demo',summary:'Details',teammates:[{userId:'member'},{email:'new-teammate@example.com'}]};
  await assert.rejects(runPresentationOperation(env,{...identity,scopes:['org:events.read']},'save',args),{status:403});
  await assert.rejects(runPresentationOperation(env,{...identity,userId:'stranger'},'save',args),{status:403});
  await assert.rejects(runPresentationOperation(env,identity,'save',{...args,organizationId:'two'}),{status:404});
  await assert.rejects(runPresentationOperation(env,identity,'save',{...args,teammates:[]}));
  const preview=await runPresentationOperation(env,identity,'save',args) as any;
  assert.equal(f.db.rows('SELECT * FROM organization_invitations').length,0,'preview must not invite');
  await assert.rejects(runPresentationOperation(env,identity,'save',{...args,title:'Changed',previewId:preview.previewId,confirm:true}),{status:409});
  const saved=await runPresentationOperation(env,identity,'save',{...args,previewId:preview.previewId,confirm:true}) as any;
  assert.equal(saved.submission_id,args.submissionId);
  const invitations=f.db.rows('SELECT * FROM organization_invitations') as any[];
  assert.equal(invitations.length,1);assert.equal(invitations[0].email,'new-teammate@example.com');
  assert.equal(f.db.rows("SELECT * FROM organization_memberships WHERE user_id='new-teammate@example.com'").length,0);
  const publicData=await(await f.request('/submissions','GET','stranger')).json() as any;
  assert.equal(publicData.submissions[0].presenters.length,3);
  assert.ok(!JSON.stringify(publicData).includes('new-teammate@example.com'));
  await assert.rejects(runPresentationOperation(env,identity,'save',{...args,previewId:preview.previewId,confirm:true}),{status:409});
  const list=await runPresentationOperation(env,identity,'list',{organizationId:'one',eventId:'event'}) as any;
  assert.equal(list.submissions.length,1);
  const foreign=await runPresentationOperation(env,{...identity,userId:'stranger'},'list',{organizationId:'one',eventId:'event'}) as any;
  assert.equal(foreign.submissions.length,0);
  await f.request('/form','PUT','host',{enabled:false});
  const edited={...args,title:'Edited after closure'};
  const receipt=await runPresentationOperation(env,identity,'save',edited) as any;
  await runPresentationOperation(env,identity,'save',{...edited,previewId:receipt.previewId,confirm:true});
  assert.equal(f.db.rows('SELECT * FROM organization_invitations').length,1,'retry/edit must reuse pending invitation');
  await assert.rejects(runPresentationOperation(env,identity,'save',{...args,submissionId:crypto.randomUUID()}),{status:409});
 }finally{f.db.sqlite.close()}
});

test('shared team changes appear on every submission and private team reads require management',async()=>{
 const f=fixture();try{
  await f.request('/form','PUT','host',{enabled:true});
  for(const id of [crypto.randomUUID(),crypto.randomUUID()])assert.equal((await f.request('/'+id,'PUT','applicant',{organization_id:'team',title:'Shared team',summary:'Details',presenters:[{userId:'member'}]})).status,200);
  f.db.sqlite.exec("INSERT INTO organization_memberships(organization_id,user_id,user_name,role,status) VALUES('team','later','New teammate','member','active')");
  const rows=(await(await f.request('/submissions','GET','')).json() as any).submissions;
  assert.equal(rows.length,2);for(const row of rows)assert.ok(row.presenters.some((person:any)=>person.name==='New teammate'));
  assert.equal((await f.request('/team/team','GET','stranger')).status,403);
  assert.equal((await f.request('/team/team','GET','host')).status,403);
  const own=await f.request('/team/team');assert.equal(own.status,200);assert.equal((await own.json() as any).people.length,3);
  f.db.sqlite.exec("UPDATE organization_memberships SET status='inactive' WHERE user_id='later'");
  const changed=(await(await f.request('/submissions','GET','')).json() as any).submissions;
  for(const row of changed)assert.equal(row.presenters.length,2);
 }finally{f.db.sqlite.close()}
});

test('standalone guest intake: no login, bounded private storage, host isolation and expiry',async()=>{
 const f=fixture();try{
  const app=presentationRoutes(async(_env,req)=>{const id=req.headers.get('Authorization');if(!id)throw new HTTPException(401);return {id};});
  app.onError((error,c)=>c.json({message:error.message},(error as any).status||500));
  const call=(suffix:string,method='GET',body?:URLSearchParams,user?:string)=>app.request('/event/presentations'+suffix,{method,headers:{...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(user?{Authorization:user}:{})},...(body?{body:body.toString()}:{})},{DB:f.db.asD1()});
  const form=new URLSearchParams({contact_name:'Guest Presenter',email:'Guest@Example.com',organization_name:'Guest Team',teammate_email:'teammate@example.com',title:'Guest demo',summary:'A private proposal'});
  assert.equal((await call('/apply')).status,409);
  assert.equal((await call('/apply','POST',form)).status,409);
  await f.request('/form','PUT','host',{enabled:true});
  const page=await call('/apply');assert.equal(page.status,200);assert.equal(page.headers.get('Cache-Control'),'no-store');
  const html=await page.text();assert.match(html,/No account needed/);assert.match(html,/method="post"/);assert.doesNotMatch(html,/<script/);
  f.db.sqlite.exec("UPDATE events SET title='<script>alert(1)</script>' WHERE id='event'");
  assert.match(await(await call('/apply')).text(),/&lt;script&gt;/);
  assert.equal((await call('/apply','POST',new URLSearchParams({...Object.fromEntries(form),website:'spam'}))).status,400);
  assert.equal((await call('/apply','POST',new URLSearchParams({...Object.fromEntries(form),email:'invalid'}))).status,400);
  assert.equal((await call('/apply','POST',new URLSearchParams({...Object.fromEntries(form),summary:'x'.repeat(40000)}))).status,413);
  const submitted=await call('/apply','POST',form);assert.equal(submitted.status,303);assert.match(submitted.headers.get('Location')||'',/^apply\/received\?submission=[0-9a-f-]{36}$/);
  assert.equal((await call('/apply/received')).status,200);
  const saved=f.db.rows('SELECT * FROM event_guest_presentations') as any[];assert.equal(saved.length,1);assert.equal(saved[0].email,'guest@example.com');assert.equal(saved[0].expires_at,'2099-04-01T12:00:00.000Z');
  assert.equal(f.db.rows('SELECT * FROM event_submissions').length,0);assert.equal(f.db.rows("SELECT * FROM organization_support_records WHERE from_label='Guest Team'").length,0);
  assert.equal((await call('/guest-review')).status,401);assert.equal((await call('/guest-review','GET',undefined,'applicant')).status,403);
  assert.equal((await call('/guest-review','GET',undefined,'stranger')).status,403);
  const review=await(await call('/guest-review','GET',undefined,'host')).json() as any;assert.equal(review.submissions.length,1);assert.equal(review.submissions[0].email,'guest@example.com');
  assert.equal(JSON.stringify(await(await f.request('/submissions','GET','')).json()).includes('guest@example.com'),false);
  assert.equal((await call('/apply','POST',form)).status,303);assert.equal((await call('/apply','POST',form)).status,303);assert.equal((await call('/apply','POST',form)).status,409);
  f.db.sqlite.exec("UPDATE event_guest_presentations SET expires_at='2000-01-01'");assert.equal(((await(await call('/guest-review','GET',undefined,'host')).json()) as any).submissions.length,0);
  f.db.sqlite.exec("UPDATE events SET starts_at='2000-01-01' WHERE id='event'");assert.equal((await call('/apply')).status,409);assert.equal((await call('/apply','POST',form)).status,409);
  f.db.sqlite.exec("DELETE FROM events WHERE id='event'");assert.equal(f.db.rows('SELECT * FROM event_guest_presentations').length,0);
 }finally{f.db.sqlite.close()}
});

test('guest acknowledgement and account claim require the same verified email and grant no organization access',async()=>{
 const f=fixture();try{
  await f.request('/form','PUT','host',{enabled:true});
  const sent:any[]=[];
  const env={DB:f.db.asD1(),PUBLIC_PORTAL_BASE_URL:'https://orgportal.cc',SUPPORT_EMAIL:{send:async(message:any)=>{sent.push(message)}}};
  const app=presentationRoutes<typeof env>(async(_env,req)=>{
   const id=req.headers.get('Authorization');if(!id)throw new HTTPException(401);
   return {id,email:id==='other'?'other@example.com':'guest@example.com',identity_data:{email_verified:id!=='unverified'}};
  });
  app.onError((error,c)=>c.json({message:error.message},(error as any).status||500));
  const form=new URLSearchParams({contact_name:'Guest',email:'Guest@Example.com',organization_name:'Guest Team',teammate_email:'teammate@example.com',title:'Private demo',summary:'Private proposal'});
  const submitted=await app.request('/event/presentations/apply',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()},env);
  assert.equal(submitted.status,303);
  const row=f.db.rows('SELECT * FROM event_guest_presentations')[0] as any;
  assert.equal(row.acknowledgement_status,'accepted');assert.equal(sent.length,1);assert.equal(sent[0].to,'guest@example.com');
  assert.match(sent[0].text,/Thank you/);assert.match(sent[0].text,/recommend claiming/);assert.match(sent[0].text,/same email address/);
  assert.match(sent[0].html,new RegExp('https://orgportal.cc/presentation-claims/event/'+row.id));
  const path='/event/presentations/guest/'+row.id;
  const call=(user:string,method='GET',suffix='')=>app.request(path+suffix,{method,headers:{Authorization:user,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify({confirm:true})}:{})},env);
  for(const user of ['','other','unverified']){assert.equal((await call(user)).status,user?403:401);assert.equal((await call(user,'POST','/claim')).status,user?403:401)}
  assert.equal((await call('recipient')).status,200);
  assert.equal((await call('recipient','POST','/claim')).status,200);assert.equal((await call('recipient','POST','/claim')).status,200);
  assert.equal((await call('different-account','POST','/claim')).status,403);
  const claimed=f.db.rows('SELECT * FROM event_guest_presentations')[0] as any;
  assert.equal(claimed.claimed_by_user_id,'recipient');assert.equal(claimed.expires_at,row.expires_at);
  assert.equal(f.db.rows("SELECT * FROM organization_memberships WHERE user_id='recipient' AND role='owner'").length,1);
  assert.equal(f.db.rows("SELECT * FROM organization_memberships WHERE organization_id IN ('one','two','team') AND user_id='recipient'").length,0);
  assert.equal(f.db.rows("SELECT * FROM organization_invitations WHERE email='teammate@example.com' AND purpose='member'").length,1);
  assert.equal(sent.length,2);assert.equal(sent[1].to,'teammate@example.com');
  assert.equal(f.db.rows('SELECT * FROM event_submissions').length,0);
  const foreign=await app.request('/another-event/presentations/guest/'+row.id,{headers:{Authorization:'recipient'}},env);assert.equal(foreign.status,404);
  f.db.sqlite.exec("UPDATE event_guest_presentations SET expires_at='2000-01-01'");assert.equal((await call('recipient')).status,404);
 }finally{f.db.sqlite.close()}
});

test('unconfirmed acknowledgement does not lose a saved application or expose its contact details',async()=>{
 const f=fixture();try{
  await f.request('/form','PUT','host',{enabled:true});
  let attempts=0;
  const env={DB:f.db.asD1(),PUBLIC_PORTAL_BASE_URL:'https://orgportal.cc',SUPPORT_EMAIL:{send:async()=>{attempts++;throw new Error('Private provider response')}}};
  const app=presentationRoutes<typeof env>(async()=>({id:'host'}));
  const form=new URLSearchParams({contact_name:'Guest',email:'guest@example.com',organization_name:'Guest Team',teammate_email:'teammate@example.com',title:'Demo',summary:'Private proposal'});
  const response=await app.request('/event/presentations/apply',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()},env);
  assert.equal(response.status,303);assert.equal(attempts,1);
  const row=f.db.rows('SELECT * FROM event_guest_presentations')[0] as any;assert.equal(row.acknowledgement_status,'uncertain');
  const receipt=await app.request('/event/presentations/'+response.headers.get('Location'),{},env);
  const html=await receipt.text();assert.match(html,/application is saved/);assert.match(html,/Claim your submission/);assert.doesNotMatch(html,/guest@example.com|Private provider response|Private proposal/);
  assert.equal(attempts,1);
 }finally{f.db.sqlite.close()}
});
