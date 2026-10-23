import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { authorizeOrganization, OrganizationIamError } from './organizationIam';

const DAY=86400_000;
const dateAt=(now:number,offset=0)=>new Date(now+offset*DAY).toISOString().slice(0,10);
export async function recordOrganizationPageView(db:D1Database,slug:string,now=Date.now()) {
 const organization=await db.prepare('SELECT id FROM organizations WHERE slug=?').bind(slug).first<{id:string}>();
 if(!organization)return false;
 const day=dateAt(now);
 // One transaction prevents lost increments or disagreement between daily/total counts.
 await db.batch([
  db.prepare(`INSERT INTO organization_page_view_totals(organization_id,views,first_day,last_day) VALUES(?,1,?,?)
   ON CONFLICT(organization_id) DO UPDATE SET views=views+1,first_day=MIN(first_day,excluded.first_day),last_day=MAX(last_day,excluded.last_day)`).bind(organization.id,day,day),
  db.prepare(`INSERT INTO organization_page_view_days(organization_id,day,views) VALUES(?,?,1)
   ON CONFLICT(organization_id,day) DO UPDATE SET views=views+1`).bind(organization.id,day),
 ]);
 return true;
}
export async function organizationPageStatistics(db:D1Database,userId:string,organizationId:string,days=30,now=Date.now()) {
 if(![7,30,90,365].includes(days))throw new HTTPException(400,{message:'Choose 7, 30, 90, or 365 days.'});
 const organization=await db.prepare('SELECT id FROM organizations WHERE id=? OR slug=?').bind(organizationId,organizationId).first<{id:string}>();
 if(!organization)throw new HTTPException(404,{message:'Organization not found'});
 organizationId=organization.id;
 await authorizeOrganization(db,{id:userId,name:userId,email:null,isOperator:false},'manage',organizationId);
 // One read snapshot keeps daily and lifetime numbers consistent during new views.
 const result=await db.prepare(`SELECT 'total' AS kind,first_day AS day,views FROM organization_page_view_totals WHERE organization_id=?
  UNION ALL SELECT 'day' AS kind,day,views FROM organization_page_view_days WHERE organization_id=? AND day>=? AND day<=?`)
  .bind(organizationId,organizationId,dateAt(now,1-Math.max(days,30)),dateAt(now)).all<{kind:'total'|'day';day:string;views:number}>();
 const total=result.results.find(row=>row.kind==='total'),rows=result.results.filter(row=>row.kind==='day');
 const counts=new Map(rows.map(row=>[row.day,row.views]));
 const count=(size:number)=>rows.filter(row=>row.day>=dateAt(now,1-size)).reduce((sum,row)=>sum+row.views,0);
 return {organizationId,timezone:'UTC',metric:'page_views',first_day:total?.day||null,total:total?.views||0,today:count(1),last_7_days:count(7),last_30_days:count(30),
  daily:Array.from({length:days},(_,index)=>{const day=dateAt(now,index+1-days);return {day,views:counts.get(day)||0}})};
}
export function organizationPageStatisticsRoutes(auth:(env:Env,request:Request)=>Promise<{id:string}>,publicOrigin:(request:Request)=>string,now=()=>Date.now()) {
 const app=new Hono<{Bindings:Env}>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next()});
 app.onError((error,c)=>{
  if(error instanceof HTTPException)return error.getResponse();
  if(error instanceof OrganizationIamError)return c.json({error:error.message},error.status as 403|404);
  return c.json({error:'Page statistics are temporarily unavailable.'},503);
 });
 app.post('/public/:slug/page-view',async(c,next)=>{
  if(c.env.ORGANIZATION_REPLICA_SOURCE)return c.body(null,204);
  // Browser fetch metadata survives tenant proxies whose internal hostname differs.
  // Older/non-browser clients must supply the exact public origin instead.
  const site=c.req.header('Sec-Fetch-Site');
  if(site?site!=='same-origin':c.req.header('Origin')!==publicOrigin(c.req.raw))return c.json({error:'Same-origin page view required'},403);
  if(!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json'))return c.json({error:'JSON required'},415);
  // Discard known crawlers/link previews before any database write. Never store their UA.
  const bot=c.req.raw.cf?.botManagement;
  if((bot&&typeof bot==='object'&&'verifiedBot' in bot&&bot.verifiedBot===true)||/bot\b|crawler|spider|facebookexternalhit|preview/i.test(c.req.header('User-Agent')||''))return c.body(null,204);
  await next();
 },bodyLimit({maxSize:128}),async c=>{
  if(!await recordOrganizationPageView(c.env.DB,c.req.param('slug'),now()))return c.json({error:'Organization not found'},404);
  return c.body(null,204);
 });
 app.get('/:organizationId/page-statistics',async c=>{
  const user=await auth(c.env,c.req.raw);
  if(c.env.ORGANIZATION_REPLICA_SOURCE)return c.json({error:'View page statistics on the authoritative portal.'},409);
  return c.json(await organizationPageStatistics(c.env.DB,user.id,c.req.param('organizationId'),Number(c.req.query('days')||30),now()));
 });
 return app;
}
