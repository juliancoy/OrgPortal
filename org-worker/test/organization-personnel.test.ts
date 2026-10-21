import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { organizationPersonnel,organizationPersonnelRoutes,monthsAfter,personnelVoteResult } from '../src/organizationPersonnel';
class Database {
 sql=new DatabaseSync(':memory:');
 constructor(){
  this.sql.exec('PRAGMA foreign_keys=ON');const dir=new URL('../migrations/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())this.sql.exec(readFileSync(new URL(name,dir),'utf8'));
  this.sql.exec("INSERT INTO organizations(id,name,slug) VALUES('one','One','one'),('two','Two','two'),('related','Related','related'); INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES('one','chair','owner','active'),('one','second','administrator','active'),('one','member','member','active'),('two','chair','member','active'),('related','donor-member','member','active');");
 }
 prepare(sql:string){const stmt=this.sql.prepare(sql);const bound=(values:unknown[]=[])=>({bind:(...v:unknown[])=>bound(v),first:async<T>()=>(stmt.get(...values as [])||null) as T|null,all:async<T>()=>({results:stmt.all(...values as []) as T[]}),run:async()=>({meta:{changes:Number(stmt.run(...values as []).changes)}})});return bound()}
 async batch(statements:{run:()=>Promise<unknown>}[]){this.sql.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());this.sql.exec('COMMIT');return out}catch(error){this.sql.exec('ROLLBACK');throw error}}
 asD1(){return this as unknown as D1Database}
}
function fixture(t:{after:(f:()=>void)=>void}){
 const db=new Database();t.after(()=>db.sql.close());
 const app=organizationPersonnelRoutes(async(_env,req)=>({id:req.headers.get('Authorization')||'outsider'}));
 async function request(path:string,user='chair',body?:Record<string,unknown>,org='one') {return app.request(`/${org}/personnel${path}`,{method:body?'POST':'GET',headers:{Authorization:user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},{DB:db.asD1()})}
 async function act(path:string,user:string,body:Record<string,unknown>){const preview=await request(path+'/preview',user,body);assert.equal(preview.status,200,await preview.clone().text());const data=await preview.json() as {previewId:string};return request(path+'/apply',user,{...body,previewId:data.previewId,confirm:true})}
 return{db,request,act};
}
test('organization-specific precedence, RSVP history, support edges and volunteer expiry',async t=>{
 const f=fixture(t),now='2026-10-21T12:00:00.000Z';
 f.db.sql.exec(`INSERT INTO events(id,ingest_key,title,slug,host_org_id,starts_at) VALUES('recent','recent','Recent','recent','one','2026-10-01T12:00:00Z'),('old','old','Old','old','one','2026-01-01T12:00:00Z'),('future','future','Future','future','one','2026-11-01T12:00:00Z'),('other','other','Other','other','two','2026-11-01T12:00:00Z');
 INSERT INTO event_registrations(event_id,user_id) VALUES('recent','guest'),('old','old-guest'),('future','future-guest'),('other','other-guest');
 INSERT INTO organization_volunteer_awards VALUES('one','guest','member','2026-10-01','2027-01-01'),('one','expired','member','2026-01-01','2026-04-01'),('one','member','chair','2026-10-01','2027-01-01');
 INSERT INTO organization_support_records(id,from_organization_id,to_organization_id,from_label,to_label,support_kind,description,source_url,created_at) VALUES('edge','related','one','Related','One','services','Support','https://example.test','2026-01-01');`);
 const classes=await organizationPersonnel(f.db.asD1(),'one',now);
 assert.equal(classes.chair,'organizer');assert.equal(classes.member,'member');assert.equal(classes.guest,'volunteer');assert.equal(classes['future-guest'],'attendee');assert.equal(classes['donor-member'],'stakeholder');
 assert.equal(classes.expired,undefined);assert.equal(classes['old-guest'],undefined);assert.equal(classes['other-guest'],undefined);
 assert.equal((await organizationPersonnel(f.db.asD1(),'two',now)).chair,'member');
 f.db.sql.exec("UPDATE organization_support_records SET status='voided' WHERE id='edge'");assert.equal((await organizationPersonnel(f.db.asD1(),'one',now))['donor-member'],undefined);
 f.db.sql.exec("UPDATE organization_support_records SET status='reported',from_organization_id='one',to_organization_id='related' WHERE id='edge'");assert.equal((await organizationPersonnel(f.db.asD1(),'one',now))['donor-member'],'stakeholder');
});
test('volunteer award membership checks, exact account IDs, one-use receipts and no IAM grants',async t=>{
 const f=fixture(t);
 assert.equal((await f.request('/volunteers/preview','outsider',{action:'award',targetUserId:'member'})).status,403);
 assert.equal((await f.request('/volunteers/preview','member',{action:'award',targetUserId:'unknown'})).status,404);
 const preview=await f.request('/volunteers/preview','member',{action:'award',targetUserId:'donor-member'});const {previewId}=await preview.json() as {previewId:string};
 const body={action:'award',targetUserId:'donor-member',previewId,confirm:true};assert.equal((await f.request('/volunteers/apply','member',body)).status,200);assert.equal((await f.request('/volunteers/apply','member',body)).status,409);
 assert.equal((await organizationPersonnel(f.db.asD1(),'one'))['donor-member'],'volunteer');
 assert.equal(f.db.sql.prepare("SELECT count(*) n FROM organization_memberships WHERE organization_id='one' AND user_id='donor-member'").get()!.n,0);
 assert.equal((await f.act('/volunteers','member',{action:'revoke',targetUserId:'donor-member'})).status,200);
 assert.equal((await f.request('','outsider')).status,403);
 const stale=await f.request('/volunteers/preview','member',{action:'award',targetUserId:'second'});const receipt=await stale.json() as {previewId:string};f.db.sql.exec("UPDATE organization_memberships SET status='inactive' WHERE user_id='member'");
 assert.equal((await f.request('/volunteers/apply','member',{action:'award',targetUserId:'second',confirm:true,previewId:receipt.previewId})).status,403);
});
test('restricted ballots require independent second, fair review, notice, quorum and deadline',async t=>{
 const f=fixture(t);
 assert.equal((await f.request('/motions','member')).status,403);
 const created=await f.act('/motions','chair',{action:'propose',targetUserId:'member',decision:'exclude'});assert.equal(created.status,200);const {motionId}=await created.json() as {motionId:string};
 assert.equal((await f.request('/motions/preview','chair',{action:'second',motionId})).status,409);
 assert.equal((await f.act('/motions','second',{action:'second',motionId})).status,200);
 assert.equal((await f.request('/motions/preview','chair',{action:'open-voting',motionId})).status,400);
 assert.equal((await f.act('/motions','chair',{action:'open-voting',motionId,procedureNote:'Every organizer notified; exact question stated; debate exhausted; subject heard.',fairReviewCompleted:true})).status,200);
 const motion=f.db.sql.prepare('SELECT * FROM organization_personnel_motions WHERE id=?').get(motionId)!;
 assert.ok(Date.parse(String(motion.voting_deadline))-Date.parse(String(motion.updated_at))>=86400000);
 assert.equal((await f.request('/motions/preview','member',{action:'vote',motionId,choice:'yea'})).status,403);
 assert.equal((await f.act('/motions','chair',{action:'vote',motionId,choice:'yea'})).status,200);
 assert.equal((await f.act('/motions','second',{action:'vote',motionId,choice:'abstain'})).status,200);
 assert.equal((await f.request('/motions/preview','chair',{action:'resolve',motionId})).status,409);
 f.db.sql.prepare("UPDATE organization_personnel_motions SET voting_deadline='2000-01-01' WHERE id=?").run(motionId);
 assert.equal((await f.act('/motions','chair',{action:'resolve',motionId})).status,200);
 assert.equal((await organizationPersonnel(f.db.asD1(),'one')).member,'persona_non_grata');
 assert.equal((await f.request('/motions/preview','chair',{action:'propose',targetUserId:'member',decision:'readmit'})).status,409);
 assert.equal((await f.request('/motions/preview','chair',{action:'resolve',motionId},'two')).status,403);
});
test('calendar-month expiry and ordinary majority with abstention counting toward quorum',()=>{
 assert.equal(monthsAfter(new Date('2026-01-31T12:00:00Z'),3),'2026-04-30T12:00:00.000Z');
 assert.equal(personnelVoteResult([{choice:'yea'},{choice:'nay'}],2).passed,false);
 assert.equal(personnelVoteResult([{choice:'yea'}],3).passed,false);
 assert.equal(personnelVoteResult([{choice:'yea'},{choice:'abstain'}],3).passed,true);
});
