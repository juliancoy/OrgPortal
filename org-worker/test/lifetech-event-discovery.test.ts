import test from 'node:test';
import assert from 'node:assert/strict';
import {FullSchemaDb} from './helpers/fullSchemaDb';
import {eventRecommendationRoutes} from '../src/eventRecommendations';

test('compact imported timezone offsets and malformed end dates filter before pagination',async()=>{
 const db=new FullSchemaDb();
 try {
  const insert=db.sql.prepare('INSERT INTO events(id,ingest_key,title,slug,starts_at,ends_at,tags) VALUES(?,?,?,?,?,?,?)');
  for(const [id,start,end] of [
   ['expired','2000-01-13T17:30:00-0500','2000-01-13T20:00:00-0500'],
   ['invalid-end','2000-01-14T17:30:00-05:00','invalid'],
   ['ongoing','2000-01-15T17:30:00-0500','2099-01-13T20:00:00-0500'],
   ['future','2099-01-13T17:30:00-0500','2099-01-13T20:00:00-0500'],
  ])insert.run(id,id,'Medical research '+id,id,start,end,'[]');
  const app=eventRecommendationRoutes(async()=>({id:'alice'}),async(_env,_req,row:{id:string})=>({id:row.id}));
  const ids=async(query:string)=>{
   const response=await app.request('/events/recommended?community=lifetech&'+query,{}, {DB:db.asD1()});
   assert.equal(response.status,200);return (await response.json() as {id:string}[]).map(row=>row.id);
  };
  assert.deepEqual(await ids('period=upcoming&limit=1'),['ongoing']);
  assert.deepEqual(await ids('period=upcoming&limit=1&offset=1'),['future']);
  assert.deepEqual(await ids('period=upcoming&limit=1&offset=2'),[]);
  assert.deepEqual(await ids('period=past'),['invalid-end','expired']);
  assert.deepEqual(await ids('period=all&sort=date&from=2099-01-13T22:00:00Z&to=2099-01-14'),['future']);
 }finally{db.sql.close()}
});

test('LifeTech discovery filters before paging, prioritizes participation and deduplicates imported events',async()=>{
 const db=new FullSchemaDb();
 try {
  db.sql.exec("INSERT INTO organizations(id,name,slug) VALUES('life','LifeTech','lifetech'),('other','Another group','other')");
  const add=db.sql.prepare('INSERT INTO events(id,ingest_key,title,slug,host_org_id,starts_at,tags) VALUES(?,?,?,?,?,?,?)');
  const fixtures:[string,string,string,string,string[]][]=[
   ['owned','Community demo','life','2099-01-17T23:00:00Z',[]],
   ['health','Better patient care','other','2099-01-18T18:00:00Z',[]],
   ['bio','Biotech research exchange','other','2099-01-19T18:00:00Z',[]],
   ['copy','Biotech research exchange','other','2099-01-19T18:00:00Z',[]],
   ['noise','Cybersecurity pitch','other','2099-01-19T18:00:00Z',['LifeTech']],
   ['yoga','Yoga and fitness','other','2099-01-19T18:00:00Z',['Health']],
   ['past','Clinical research','other','2000-01-19T18:00:00Z',[]],
  ];
  for(const [id,title,host,date,tags] of fixtures)add.run(id,id,title,id,host,date,JSON.stringify(tags));
  db.sql.exec("INSERT INTO event_registrations(event_id,user_id) VALUES('bio','alice')");
  const app=eventRecommendationRoutes(async()=>({id:'alice'}),async(_env,_req,row:{id:string})=>({id:row.id}));
  const page=async(query='',signed=false)=>{
   const response=await app.request('/events/recommended?community=lifetech&period=upcoming&limit=2'+query,{headers:signed?{Authorization:'verified-fixture'}:{}},{DB:db.asD1()});
   assert.equal(response.status,200);return response.json() as Promise<{id:string;community_event:boolean}[]>;
  };
  assert.deepEqual((await page()).map(row=>row.id),['owned','bio']);
  assert.deepEqual((await page('&offset=2')).map(row=>row.id),['health']);
  assert.deepEqual(await page('&offset=3'),[]);
  assert.deepEqual((await page('&category=biotech')).map(row=>row.id),['bio']);
  assert.deepEqual((await page('&category=community')).map(row=>row.id),['owned']);
  assert.deepEqual((await page('&q=patient')).map(row=>row.id),['health']);
  assert.equal((await page('&from=2100-01-01')).length,0);
  assert.deepEqual((await page('&from=2099-01-18&to=2099-01-19')).map(row=>row.id),['health']);
  assert.deepEqual((await page('&sort=date')).map(row=>row.id),['owned','health']);
  assert.equal((await page('',true))[0].id,'bio');
  assert.equal((await page())[0].community_event,true);
  const past=await app.request('/events/recommended?community=lifetech&period=past',{}, {DB:db.asD1()});
  assert.deepEqual((await past.json() as {id:string}[]).map(row=>row.id),['past']);
 }finally{db.sql.close()}
});
