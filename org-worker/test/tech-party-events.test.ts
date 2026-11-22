import assert from 'node:assert/strict';
import test from 'node:test';
import {FullSchemaDb} from './helpers/fullSchemaDb';
import {eventRecommendationRoutes} from '../src/eventRecommendations';
import {isPoliticalEvent} from '../../shared/eventRelevance';

test('political scope follows Code Collective sector tags, not incidental words or branding',()=>{
 for(const tag of ['Politics',' civic tech ','POLICY'])assert.equal(isPoliticalEvent({tags:[tag]}),true);
 for(const tags of [null,'Politics',[],['Tech Party'],['Government'],['Privacy Policy'],[null,{}]])assert.equal(isPoliticalEvent({tags}),false);
});

test('political calendar filters before pagination, includes all hosted and co-hosted events and highlights only organization links',async()=>{
 const db=new FullSchemaDb();
 try {
  db.sql.exec("INSERT INTO organizations(id,name,slug) VALUES('party','Tech Party','tech-party'),('other','Other','other'),('life','LifeTech','lifetech')");
  const add=db.sql.prepare('INSERT INTO events(id,ingest_key,title,slug,host_org_id,starts_at,tags) VALUES(?,?,?,?,?,?,?)');
  const fixtures:[string,string,string,string,string[]][]=[
   ['unrelated','Concert','other','2099-01-01T18:00:00Z',[]],
   ['politics','Candidate debate','other','2099-01-02T18:00:00Z',['Politics']],
   ['owned','Community gathering','party','2099-01-03T18:00:00Z',[]],
   ['owned-two','Community gathering','party','2099-01-03T18:00:00Z',[]],
   ['cohost','Community workshop','other','2099-01-04T18:00:00Z',[]],
   ['civic','Civic tools','other','2099-01-05T18:00:00Z',['Civic Tech']],
   ['policy','Housing policy discussion','other','2099-01-06T18:00:00Z',['Policy']],
   ['spoof','Tech Party social','other','2099-01-07T18:00:00Z',['Tech Party']],
   ['mention','Tech Party debate','other','2099-01-08T18:00:00Z',['Politics']],
   ['medical','Medical gathering','life','2099-01-09T18:00:00Z',['Health']],
   ['past','Past meeting','party','2000-01-01T18:00:00Z',[]],
   ['malformed','Bad tags','other','2099-01-10T18:00:00Z',[]],
  ];
  for(const [id,title,host,date,tags] of fixtures)add.run(id,id,title,id,host,date,JSON.stringify(tags));
  db.sql.exec("INSERT INTO event_organizations(event_id,organization_id) VALUES('cohost','party'); UPDATE events SET tags='not json' WHERE id='malformed'");
  const app=eventRecommendationRoutes(async()=>({id:'fixture'}),async(_env,_req,row:{id:string})=>({id:row.id}));
  const page=async(query='')=>{
   const response=await app.request('/events/recommended?community=tech-party&period=upcoming&sort=date&'+query,{}, {DB:db.asD1()});
   assert.equal(response.status,200);return response.json() as Promise<{id:string;community_event:boolean}[]>;
  };
  assert.deepEqual((await page()).map(e=>e.id),['politics','owned','owned-two','cohost','civic','policy','mention']);
  assert.deepEqual((await page()).filter(e=>e.community_event).map(e=>e.id),['owned','owned-two','cohost']);
  assert.deepEqual((await page('limit=2&offset=0')).map(e=>e.id),['politics','owned']);
  assert.deepEqual((await page('limit=2&offset=2')).map(e=>e.id),['owned-two','cohost']);
  assert.deepEqual(await page('offset=7'),[]);
  assert.deepEqual((await page('category=community')).map(e=>e.id),['owned','owned-two','cohost']);
  assert.deepEqual((await page('q=Housing')).map(e=>e.id),['policy']);
  assert.deepEqual((await page('from=2099-01-04&to=2099-01-06')).map(e=>e.id),['cohost','civic']);
  assert.deepEqual(await page('q=concert'),[]);
  const past=await app.request('/events/recommended?community=tech-party&period=past',{}, {DB:db.asD1()});
  assert.deepEqual((await past.json() as {id:string}[]).map(e=>e.id),['past']);
 }finally{db.sql.close()}
});
