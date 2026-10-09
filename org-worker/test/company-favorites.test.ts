import test from 'node:test';
import assert from 'node:assert/strict';
import { EventTestDb } from './event-test-db';
import { companyVoteSummary, favoriteLimit, ownCompanyVotes, saveCompanyVote } from '../src/companyVotes';
import { getCompanyVotes, runCompanyBallotOperation, runCompanyVoteOperation } from '../src/companyVotesMcp';
const admin = { userId: 'pidp-user', scopes: ['org:events.read','org:events.write'] };
const plan = { eventId: 'pitch', organizationId: 'org-one', mode: 'favorites', selectionFraction: 0.25 };
async function setup() {
 const db = new EventTestDb();await db.prepare('PRAGMA foreign_keys = ON').run();
 await db.prepare("INSERT INTO events (id,ingest_key,title,slug,host_org_id,created_at,updated_at) VALUES ('pitch','pitch','Pitch','pitch','org-one','','')").run();
 await db.prepare("INSERT INTO event_company_ballots(event_id,closes_at,enabled) VALUES ('pitch','2099-10-16T00:00:00Z',1)").run();
 for(const id of ['a','b','c','d','e']) {await db.prepare('INSERT INTO organizations(id,name,slug) VALUES (?,?,?)').bind(id,id,id).run();await db.prepare('INSERT INTO event_pitch_companies VALUES (?,?)').bind('pitch',id).run();}
 return {db,d1:db as unknown as D1Database,env:{DB:db} as unknown as Env};
}
test('favorites round up and enforce per-account caps atomically, forbid downvotes, retain legacy votes',async()=>{
 const {db,d1}=await setup();try{
  assert.deepEqual([0,1,4,5,8,9].map(n=>favoriteLimit(n,.25)),[0,1,1,2,2,3]);
  await saveCompanyVote(d1,'pitch','a','alice',-1);
  await db.prepare("UPDATE event_company_ballots SET mode='favorites'").run();
  assert.deepEqual((await ownCompanyVotes(d1,'pitch','alice')).votes,{});
  assert.equal((await companyVoteSummary(d1,'pitch')).selection_limit,2);
  await assert.rejects(saveCompanyVote(d1,'pitch','a','alice',-1),/no downvotes/);
  await assert.rejects(saveCompanyVote(d1,'pitch','a','alice',1,'up_down'),/mode changed/);
  const results=await Promise.allSettled(['a','b','c','d','e'].map(id=>saveCompanyVote(d1,'pitch',id,'alice',1,'favorites')));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
  await saveCompanyVote(d1,'pitch','a','alice',1); // idempotent at cap
  await saveCompanyVote(d1,'pitch','c','bob',1);
  await assert.rejects(saveCompanyVote(d1,'pitch','outsider','alice',1),/roster changed/);
  await saveCompanyVote(d1,'pitch','a','alice',0);await saveCompanyVote(d1,'pitch','c','alice',1);
  const s=await companyVoteSummary(d1,'pitch');assert.equal(s.companies.find(c=>c.id==='c')!.score,2);assert.ok(s.companies.every(c=>c.downvotes===0));assert.ok(!JSON.stringify(s).includes('alice'));
  await db.prepare("UPDATE event_company_favorites SET expires_at='2000-01-01T00:00:00Z' WHERE user_id='bob'").run();
  assert.equal((await companyVoteSummary(d1,'pitch')).companies.find(c=>c.id==='c')!.score,1);
  await db.prepare("UPDATE event_company_ballots SET enabled=0").run();
  await assert.rejects(saveCompanyVote(d1,'pitch','d','alice',1),/voting closed/);
  await saveCompanyVote(d1,'pitch','c','alice',0);
  await db.prepare("UPDATE event_company_ballots SET mode='up_down'").run();
  assert.deepEqual((await ownCompanyVotes(d1,'pitch','alice')).votes,{a:-1});
 }finally{db.close();}
});
test('MCP configuration checks live permissions, exact one-use receipt, scopes, and saved favorite budget',async()=>{
 const {db,d1,env}=await setup();try{
  await assert.rejects(runCompanyBallotOperation(env,{...admin,scopes:[]},plan),/scope/);
  await assert.rejects(runCompanyBallotOperation(env,{...admin,userId:'outsider'},plan));
  await assert.rejects(runCompanyBallotOperation(env,admin,{...plan,organizationId:'elsewhere'}),/not found/);
  for(const selectionFraction of [0,1.1])await assert.rejects(runCompanyBallotOperation(env,admin,{...plan,selectionFraction}));
  await assert.rejects(runCompanyBallotOperation(env,admin,{...plan,confirm:true}),/Preview/);
  const preview=await runCompanyBallotOperation(env,admin,plan),apply={...plan,confirm:true,previewId:preview.previewId};
  assert.equal('selectionLimit' in preview && preview.selectionLimit,2);
  await assert.rejects(runCompanyBallotOperation(env,admin,{...apply,selectionFraction:.5}),/Preview/);
  await assert.rejects(runCompanyBallotOperation(env,{...admin,scopes:['org:events.read']},apply),/scope/);
  await db.prepare("UPDATE organization_memberships SET status='inactive'").run();await assert.rejects(runCompanyBallotOperation(env,admin,apply));
  await db.prepare("UPDATE organization_memberships SET status='active'").run();
  const saved=await runCompanyBallotOperation(env,admin,apply);assert.equal('success' in saved && saved.success,true);
  await assert.rejects(runCompanyBallotOperation(env,admin,apply),/Preview/);
  await saveCompanyVote(d1,'pitch','a','alice',1);await saveCompanyVote(d1,'pitch','b','alice',1);
  const smaller={...plan,selectionFraction:.1},p=await runCompanyBallotOperation(env,admin,smaller);
  await assert.rejects(runCompanyBallotOperation(env,admin,{...smaller,confirm:true,previewId:p.previewId}),/budget/);
 }finally{db.close();}
});
test('MCP voting shares website limits, authenticates voter identity, isolates accounts, permits closed clearing',async()=>{
 const {db,env}=await setup();try{
  await db.prepare("UPDATE event_company_ballots SET mode='favorites'").run();
  const voter={...admin,userId:'voter'},vote={organizationId:'org-one',eventId:'pitch',companyId:'a',mode:'favorites',value:1};
  await assert.rejects(runCompanyVoteOperation(env,voter,{...vote,userId:'victim'}));await assert.rejects(runCompanyVoteOperation(env,voter,{...vote,value:-1}),/no downvotes/);
  for(const companyId of ['a','b']){const args={...vote,companyId},p=await runCompanyVoteOperation(env,voter,args);const r=await runCompanyVoteOperation(env,voter,{...args,confirm:true,previewId:p.previewId});assert.equal('success' in r && r.success,true);}
  const target={organizationId:'org-one',eventId:'pitch'};
  assert.deepEqual((await getCompanyVotes(env,voter,target)).votes,{a:1,b:1});assert.deepEqual((await getCompanyVotes(env,admin,target)).votes,{});
  const extra={...vote,companyId:'c'},p=await runCompanyVoteOperation(env,voter,extra);await assert.rejects(runCompanyVoteOperation(env,voter,{...extra,confirm:true,previewId:p.previewId}),/limit/);
  await db.prepare("UPDATE event_company_ballots SET enabled=0").run();
  const clear={...vote,value:0},receipt=await runCompanyVoteOperation(env,voter,clear);const r=await runCompanyVoteOperation(env,voter,{...clear,confirm:true,previewId:receipt.previewId});assert.equal('success' in r && r.success,true);
 }finally{db.close();}
});

test('verified primary operators can configure ballots without organization membership',async()=>{
 const {db,env}=await setup();try {
  const operator={...admin,userId:'verified-operator',isOperator:true};
  await assert.rejects(runCompanyBallotOperation(env,{...operator,isOperator:false},plan));
  const p=await runCompanyBallotOperation(env,operator,plan);
  const r=await runCompanyBallotOperation(env,operator,{...plan,confirm:true,previewId:p.previewId});
  assert.equal('success' in r && r.success,true);
 }finally {db.close();}
});
