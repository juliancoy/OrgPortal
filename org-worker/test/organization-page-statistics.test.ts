import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HTTPException} from 'hono/http-exception';
import {EventTestDb} from './event-test-db';
import {organizationPageStatistics,organizationPageStatisticsRoutes,recordOrganizationPageView} from '../src/organizationPageStatistics';
const now=Date.parse('2026-10-23T12:00:00Z'),day=86400_000;
function fixture(){return new EventTestDb(`CREATE TABLE change_journal_exclusions(table_name TEXT PRIMARY KEY,reason TEXT);
 INSERT INTO organizations(id,name,slug) VALUES('other','Other','other');
 INSERT INTO organization_memberships VALUES('org-one','member','member','active'),('org-one','organizer','administrator','active'),('other','other-owner','owner','active');
 `+readFileSync(new URL('../migrations/0106_organization_page_statistics.sql',import.meta.url),'utf8'))}
test('anonymous atomic counters isolate organizations, preserve totals and return exact UTC windows with zero days',async()=>{
 const db=fixture(),d1=db as unknown as D1Database;
 try{
  for(const offset of [0,0,-1,-6,-7,-29,-30,-365])assert.equal(await recordOrganizationPageView(d1,'one',now+offset*day),true);
  assert.equal(await recordOrganizationPageView(d1,'other',now),true);
  assert.equal(await recordOrganizationPageView(d1,'missing',now),false);
  const report=await organizationPageStatistics(d1,'pidp-user','org-one',7,now);
  assert.equal(report.total,8);assert.equal(report.today,2);assert.equal(report.last_7_days,4);assert.equal(report.last_30_days,6);
  assert.equal(report.first_day,'2025-10-23');
  assert.equal(report.daily.length,7);assert.deepEqual(report.daily[6],{day:'2026-10-23',views:2});assert.equal(report.daily[1].views,0);
  assert.equal((await organizationPageStatistics(d1,'other-owner','other',30,now)).total,1);
  await assert.rejects(organizationPageStatistics(d1,'member','org-one',30,now));
  await assert.rejects(organizationPageStatistics(d1,'other-owner','org-one',30,now));
  await assert.rejects(organizationPageStatistics(d1,'pidp-user','org-one',500,now));
  assert.equal((await organizationPageStatistics(d1,'organizer','org-one',30,now)).total,8);
  assert.equal((await organizationPageStatistics(d1,'organizer','one',30,now)).total,8);
  // A failure after the total increment rolls back both writes.
  const failed={prepare(sql:string){const statement=db.prepare(sql);if(!sql.includes('INSERT INTO organization_page_view_days'))return statement;return {...statement,bind(...values:unknown[]){const bound=statement.bind(...values);return {...bound,run:async()=>{await bound.run();throw Error('injected failure')}}}}},batch:db.batch.bind(db)} as unknown as D1Database;
  await assert.rejects(recordOrganizationPageView(failed,'one',now));
  assert.equal((await organizationPageStatistics(d1,'pidp-user','org-one',7,now)).total,8);
  assert.equal((await organizationPageStatistics(d1,'pidp-user','org-one',7,now)).today,2);
  await db.prepare('PRAGMA foreign_keys=ON').run();await db.prepare("DELETE FROM organizations WHERE id='org-one'").run();
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM organization_page_view_totals WHERE organization_id='org-one'").first() as {n:number}).n,0);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM organization_page_view_days WHERE organization_id='org-one'").first() as {n:number}).n,0);
 }finally{db.close()}
});
test('counting requires same-origin JSON, ignores known bots/replicas, and reports need live manager access',async()=>{
 const db=fixture(),d1=db as unknown as D1Database;
 try{
  const routes=organizationPageStatisticsRoutes(async(_env,request)=>{const id=request.headers.get('Authorization');if(!id)throw new HTTPException(401);return {id}},request=>new URL(request.url).origin,()=>now);
  const env={DB:d1} as Env,url='https://portal.example/public/one/page-view';
  const headers={Origin:'https://portal.example','Content-Type':'application/json','User-Agent':'Browser'};
  assert.equal((await routes.request(url,{method:'POST',headers,body:'{}'},env)).status,204);
  assert.equal((await routes.request(url,{method:'POST',headers:{...headers,'User-Agent':'Googlebot'},body:'{}'},env)).status,204);
  const verified=new Request(url,{method:'POST',headers,body:'{}'});Object.defineProperty(verified,'cf',{value:{botManagement:{verifiedBot:true}}});
  assert.equal((await routes.fetch(verified,env)).status,204);
  assert.equal((await routes.request(url,{method:'POST',headers:{...headers,Origin:'https://attacker.example'},body:'{}'},env)).status,403);
  assert.equal((await routes.request(url,{method:'POST',headers:{...headers,'Sec-Fetch-Site':'cross-site'},body:'{}'},env)).status,403);
  assert.equal((await routes.request(url,{method:'POST',headers:{...headers,'Sec-Fetch-Site':'same-site'},body:'{}'},env)).status,403);
  assert.equal((await routes.request(url,{method:'POST',headers:{Origin:headers.Origin},body:'x'},env)).status,415);
  assert.equal((await routes.request(url,{method:'POST',headers,body:'x'.repeat(200)},env)).status,413);
  assert.equal((await routes.request(url,{method:'POST',headers,body:'{}'},{...env,ORGANIZATION_REPLICA_SOURCE:'https://primary.example/snapshot'})).status,204);
  const reportUrl='https://portal.example/org-one/page-statistics?days=7';
  assert.equal((await routes.request(reportUrl,{},env)).status,401);
  assert.equal((await routes.request(reportUrl,{headers:{Authorization:'member'}},env)).status,403);
  const response=await routes.request(reportUrl,{headers:{Authorization:'pidp-user'}},env);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal((await response.json() as {total:number}).total,1);
  assert.equal((await routes.request(reportUrl,{headers:{Authorization:'pidp-user'}},{...env,ORGANIZATION_REPLICA_SOURCE:'https://primary.example/snapshot'})).status,409);
  await db.prepare("UPDATE organization_memberships SET status='inactive' WHERE user_id='pidp-user'").run();
  assert.equal((await routes.request(reportUrl,{headers:{Authorization:'pidp-user'}},env)).status,403);
 }finally{db.close()}
});
