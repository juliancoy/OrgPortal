import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { executeGovernanceAction, governanceService } from '../src/index';
import { runGovernanceOperation } from '../src/governanceMcp';
import { constitutionalResult, readGovernanceDocument } from '../src/governanceDocuments';
function fixture() {
 const sql=new DatabaseSync(':memory:');
 for(const file of ['0001_contact_pages.sql','0002_org_event_directories.sql','0003_governance.sql','0015_organization_iam.sql','0017_event_mcp_operations.sql','0055_governance_documents.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const db={prepare(query:string){const statement=sql.prepare(query);const bound=(args:any[])=>({bind:(...args:any[])=>bound(args),first:async()=>statement.get(...args)||null,all:async()=>({results:statement.all(...args)}),run:async()=>({meta:{changes:Number(statement.run(...args).changes)}})});return bound([])},async batch(statements:any[]){sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}} as unknown as D1Database;
 sql.exec(`INSERT INTO organizations(id,name,slug,tags,city) VALUES('life','LifeTech','lifetech','[]','Baltimore'),('other','Other','other','[]','Baltimore');
 INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES('life','member','member','active'),('life','member2','member','active'),('life','chair','owner','active'),('life','second','administrator','active'),('life','third','administrator','active'),('other','outsider','owner','active');`);
 const run=(operation:any,args:any,userId='member')=>runGovernanceOperation(db,{userId,scopes:['org:portal.read','org:portal.write']},operation,{organizationId:'life',...args},governanceService(db)) as Promise<any>;
 const apply=async(operation:any,args:any,userId='member')=>{const preview=await run(operation,args,userId);return (await run(operation,{...args,confirm:true,previewId:preview.previewId},userId)).result};
 const proposal=(replacement='Updated LifeTech mission for this test.')=>({title:'Clarify mission',body:'Make the purpose clearer.',documentChange:{documentId:'lifetech-constitution',sectionId:'overview',version:1,replacement}});
 const action=(id:string,action:string,extra={})=>({motionId:id,action,...extra});
 const ballot=async(id:string)=>{await apply('action',action(id,'second'),'second');await apply('action',action(id,'recognize',{procedureNote:'The exact question is stated.'}),'chair');sql.prepare('UPDATE governance_motions SET created_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z',id);await apply('action',action(id,'open-voting',{procedureNote:'Every organizer received notice. Debate is exhausted.'}),'chair')};
 return {sql,db,run,apply,proposal,action,ballot};
}
test('constitutional thresholds exclude abstentions and require two thirds plus quorum',()=>{
 assert.equal(constitutionalResult([{choice:'yea'},{choice:'nay'}],3).passed,false);
 assert.equal(constitutionalResult([{choice:'yea'},{choice:'yea'},{choice:'nay'}],3).passed,true);
 assert.equal(constitutionalResult([{choice:'yea'},{choice:'abstain'}],3).passed,true);
 assert.equal(constitutionalResult([{choice:'abstain'},{choice:'abstain'}],3).passed,false);
 assert.equal(constitutionalResult([{choice:'yea'}],3).passed,false);
});
test('member receipt required; only organizers second, recognize and vote',async()=>{
 const f=fixture();try{
  await assert.rejects(f.run('propose',f.proposal(),'outsider'),/membership/);
  const ticket=await f.apply('propose',f.proposal());assert.equal(ticket.document_id,'lifetech-constitution');
  await assert.rejects(executeGovernanceAction(f.db,{id:'second'},'second',ticket.id,{}),/preview/);
  await assert.rejects(f.apply('action',f.action(ticket.id,'second'),'member2'),/organizers/);
  await assert.rejects(f.apply('action',f.action(ticket.id,'open-voting',{procedureNote:'Skip second'}),'chair'),/required state/);
  await f.apply('action',f.action(ticket.id,'second'),'second');
  await assert.rejects(f.apply('action',f.action(ticket.id,'withdraw')),/required state/);
  await f.apply('action',f.action(ticket.id,'recognize',{procedureNote:'The question is stated.'}),'chair');
  await assert.rejects(f.apply('action',f.action(ticket.id,'open-voting',{procedureNote:'Notice delivered'}),'chair'),/Seven full days/);
  await assert.rejects(f.apply('action',f.action(ticket.id,'table'),'chair'),/chaired meeting/);
  await f.apply('action',f.action(ticket.id,'comment',{body:'Retain the public-health purpose.'}));
  assert.equal((await f.run('get',{motionId:ticket.id})).comments.length,1);
 }finally{f.sql.close()}
});
test('ballot closes on time and creates one immutable draft revision',async()=>{
 const f=fixture();try{
  const ticket=await f.apply('propose',f.proposal());await f.ballot(ticket.id);
  await assert.rejects(f.apply('action',f.action(ticket.id,'vote',{choice:'yea'})),/organizers/);
  await assert.rejects(f.apply('action',f.action(ticket.id,'resolve'),'chair'),/deadline/);
  for(const [user,choice] of [['chair','yea'],['second','nay'],['second','yea'],['third','abstain']])await f.apply('action',f.action(ticket.id,'vote',{choice}),user);
  assert.equal(Number(f.sql.prepare('SELECT count(*) n FROM governance_votes WHERE motion_id=?').get(ticket.id)!.n),3);
  f.sql.prepare('UPDATE governance_motions SET voting_deadline=? WHERE id=?').run('2020-01-01T00:00:00.000Z',ticket.id);
  await assert.rejects(f.apply('action',f.action(ticket.id,'vote',{choice:'nay'}),'third'),/no longer/);
  assert.equal((await f.apply('action',f.action(ticket.id,'resolve'),'chair')).status,'passed');
  const doc=await readGovernanceDocument(f.db);assert.equal(doc.version,2);assert.equal(doc.status,'Unratified draft');assert.equal(doc.sections[0].text,f.proposal().documentChange.replacement);
  assert.equal((await f.run('get',{motionId:ticket.id})).appliedVersion,2);
  await assert.rejects(f.apply('action',f.action(ticket.id,'resolve'),'chair'),/required state/);
  await assert.rejects(f.apply('propose',f.proposal()),/Document changed/);
 }finally{f.sql.close()}
});
test('simultaneous proposals preserve intervening revisions',async()=>{
 const f=fixture();try{
  const first=await f.apply('propose',f.proposal('First wording')),second=await f.apply('propose',f.proposal('Second wording'));
  for(const t of [first,second]){await f.ballot(t.id);for(const u of ['chair','second'])await f.apply('action',f.action(t.id,'vote',{choice:'yea'}),u)}
  f.sql.exec("UPDATE governance_motions SET voting_deadline='2020-01-01T00:00:00.000Z' WHERE document_id IS NOT NULL");
  await f.apply('action',f.action(first.id,'resolve'),'chair');await f.apply('action',f.action(second.id,'resolve'),'chair');
  assert.equal((await readGovernanceDocument(f.db)).sections[0].text,'First wording');
  const other=await f.run('get',{motionId:second.id});assert.equal(other.motion.status,'passed');assert.equal(other.appliedVersion,null);
 }finally{f.sql.close()}
});
test('changed organizer roll invalidates ballot',async()=>{
 const f=fixture();try{
  const ticket=await f.apply('propose',f.proposal());await f.ballot(ticket.id);
  for(const u of ['chair','second'])await f.apply('action',f.action(ticket.id,'vote',{choice:'yea'}),u);
  f.sql.exec("UPDATE organization_memberships SET status='inactive' WHERE user_id='second'; UPDATE governance_motions SET voting_deadline='2020-01-01T00:00:00.000Z' WHERE document_id IS NOT NULL");
  await f.apply('action',f.action(ticket.id,'resolve'),'chair');
  const result=await f.run('get',{motionId:ticket.id});assert.equal(result.motion.status,'failed');assert.equal(result.results.electorate_changed,true);assert.equal((await readGovernanceDocument(f.db)).version,1);
 }finally{f.sql.close()}
});
