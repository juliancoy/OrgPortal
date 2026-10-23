import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HTTPException } from 'hono/http-exception';
import { EventTestDb } from './event-test-db';
import { organizationRecognitionRoutes,recognitionVoteLimit } from '../src/organizationRecognition';
test('private replaceable ballots, atomic quarter cap, tenant isolation, moderation and expiry',async()=>{
 const db=new EventTestDb(`CREATE TABLE change_journal_exclusions(table_name TEXT PRIMARY KEY,reason TEXT);`+readFileSync(new URL('../migrations/0101_organization_recognition.sql',import.meta.url),'utf8'));
 try{
  await db.prepare("INSERT INTO organizations(id,name,slug) VALUES('other','Other','other')").run();
  const app=organizationRecognitionRoutes(async(_env,req)=>{const id=req.headers.get('authorization');if(!id)throw new HTTPException(401);return {id}});
  const request=(path='',user?:string,method='GET',body?:unknown,org='one')=>app.fetch(new Request(`https://example.test/${org}/five-over-five${path}`,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:user}:{})},body:body===undefined?undefined:JSON.stringify(body)}),{DB:db as unknown as D1Database} as Env);
  const payload=(name:string)=>({name,accomplishment:'Built something useful.',connection:'Collaborates in our community.',eligible:true,consent:true});
  assert.deepEqual([0,1,4,5,8,9].map(recognitionVoteLimit),[0,1,1,2,2,3]);
  assert.equal((await request('/nominees',undefined,'POST',payload('Anon'))).status,401);
  for(const body of [{...payload('A'),eligible:false},{...payload('A'),consent:false},{...payload('A'),profileUrl:'javascript:alert(1)'},{...payload('A'),submitted_by:'victim'}])assert.equal((await request('/nominees','alice','POST',body)).status,400);
  const ids:string[]=[];
  for(let i=0;i<9;i++){const r=await request('/nominees','alice','POST',payload('Person '+i));assert.equal(r.status,201);ids.push((await r.json() as {id:string}).id)}
  assert.equal((await request('/nominees','bob','POST',payload('person 0'))).status,409);
  assert.equal((await request('/ballot',undefined,'PUT',{selections:[]})).status,401);
  assert.equal((await request('/ballot','alice','PUT',{selections:ids.slice(0,4)})).status,409);
  assert.equal((await request('/ballot','alice','PUT',{selections:[ids[0],ids[0]]})).status,400);
  assert.equal((await request('/ballot','alice','PUT',{selections:[ids[0]]},'other')).status,409);
  for(let i=0;i<2;i++)assert.equal((await request('/ballot','alice','PUT',{selections:ids.slice(0,3)})).status,200);
  await request('/ballot','bob','PUT',{selections:[ids[0]]});
  let listing=await(await request()).json() as {limit:number;nominees:{id:string;votes:number}[]};
  assert.equal(listing.limit,3);assert.equal(listing.nominees[0].votes,2);
  for(const text of ['alice','submitted_by','user_id'])assert.ok(!JSON.stringify(listing).includes(text));
  assert.deepEqual((await(await request('/mine','bob')).json() as {selections:string[]}).selections,[ids[0]]);
  assert.equal((await request('/nominees/'+ids[0],'bob','DELETE')).status,404);
  assert.equal((await request('/nominees/'+ids[0],'alice','DELETE',undefined,'other')).status,404);
  assert.equal((await request('/nominees/'+ids[8],'pidp-user','DELETE')).status,200);
  assert.equal((await(await request('/mine','alice')).json() as {selections:string[]}).selections.length,2);
  assert.equal((await request('/ballot','alice','PUT',{selections:ids.slice(0,3)})).status,409);
  await request('/nominees/'+ids[0],'alice','DELETE');
  listing=await(await request()).json() as typeof listing;assert.ok(!listing.nominees.some(row=>row.id===ids[0]));
  assert.deepEqual((await(await request('/mine','bob')).json() as {selections:string[]}).selections,[]);
  await request('/ballot','alice','DELETE');assert.deepEqual((await(await request('/mine','alice')).json() as {selections:string[]}).selections,[]);
  await db.prepare("UPDATE organization_memberships SET status='inactive' WHERE user_id='pidp-user'").run();
  assert.equal((await request('/nominees/'+ids[1],'pidp-user','DELETE')).status,404);
  await db.prepare("UPDATE organization_recognition_nominees SET expires_at='2000-01-01T00:00:00Z'").run();
  assert.equal((await request('/ballot','bob','PUT',{selections:[ids[1]]})).status,409);
  assert.equal((await(await request()).json() as {limit:number}).limit,0);
  assert.equal((await request('',undefined,'GET',undefined,'missing')).status,404);
 }finally{db.close()}
});
