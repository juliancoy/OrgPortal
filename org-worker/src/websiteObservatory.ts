import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

type Bindings = Env & { WEBSITE_OBSERVATORY_TOKEN?: string };
const prefix = 'private/website-observatory/runs/';
const controlKey = 'private/website-observatory/control.json';
const sites = ['https://codecollective.us/', 'https://lifetech.fyi/'] as const;
const retention = 30 * 86400000;
const origin = z.string().max(255).refine(value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && value === u.origin && !u.username && !u.password; } catch { return false; } });
const number = z.number().finite().nonnegative();
const row = z.object({ origin, method: z.string().regex(/^[A-Z]{1,12}$/), type: z.string().max(30), status: z.number().int().min(100).max(599).nullable(), bytes: number.nullable(), duration_ms: number.nullable(), error: z.enum(['request_failed']).nullable(), blocked: z.enum(['non_read_method','media_excluded','request_limit']).nullable(), server_ip: z.union([z.ipv4(), z.ipv6()]).nullable().optional(), failure_code: z.string().regex(/^(net::ERR_[A-Z_]+|unknown_network_error)$/).optional(), cancelled: z.boolean().optional() });
const schema = z.object({ schema_version: z.literal(1), site: z.enum(sites), observed: z.iso.datetime({ offset: true }), duration_seconds: number.max(90), requests: z.array(row).max(1000), initiators: z.array(z.object({ source: origin, target: origin, basis: z.literal('CDP request script/parser initiator origin') })).max(2000), metrics: z.object({ ttfb_ms:number.nullable().optional(), dom_content_loaded_ms:number.nullable().optional(), load_ms:number.nullable().optional(), fcp_ms:number.nullable().optional(), lcp_observed_ms:number.nullable().optional() }), navigation_error: z.string().max(80).nullable(), javascript_errors:number, final_origin:origin.nullable(), evidence:z.literal('synthetic_browser'), vantage:z.string().max(200), coverage:z.string().max(1000), collector_revision:z.string().regex(/^[a-f0-9]{16}$/).optional(), browser_version:z.string().max(80).optional() });
type Run = z.infer<typeof schema>;
function summarize(run: Run) {
  const origins = new Map<string, any>(), links = new Map<string, any>();
  for (const r of run.requests) {
    const n = origins.get(r.origin) || {origin:r.origin,requests:0,bytes:0,unknown_bytes:0,errors:0,blocked:0,cancelled:0,auth_challenges:0,statuses:{},types:{},ips:[],durations:[]};
    n.requests++; n.bytes += r.bytes || 0; n.unknown_bytes += Number(r.bytes === null); n.blocked += Number(Boolean(r.blocked)); n.cancelled += Number(Boolean(r.cancelled)); n.auth_challenges += Number([401,403].includes(r.status || 0));
    n.errors += Number(!r.blocked && !r.cancelled && Boolean(r.error || ((r.status || 0) >= 400 && ![401,403].includes(r.status || 0))));
    if(r.status)n.statuses[r.status]=(n.statuses[r.status]||0)+1;
    n.types[r.type]=(n.types[r.type]||0)+1;
    if(r.server_ip && !n.ips.includes(r.server_ip))n.ips.push(r.server_ip);
    if(r.duration_ms!==null)n.durations.push(r.duration_ms);
    origins.set(r.origin,n);
  }
  for(const n of origins.values()){n.mean_duration_ms=n.durations.length?n.durations.reduce((a:number,b:number)=>a+b,0)/n.durations.length:null;delete n.durations;}
  for(const e of run.initiators){if(e.source===e.target)continue;const key=e.source+'|'+e.target;const item=links.get(key)||{...e,requests:0};item.requests++;links.set(key,item);}
  const nodes=[...origins.values()];
  return {origins:nodes,links:[...links.values()],requests:run.requests.length,bytes:nodes.reduce((a,n)=>a+n.bytes,0),errors:nodes.reduce((a,n)=>a+n.errors,0),blocked:nodes.reduce((a,n)=>a+n.blocked,0),auth_challenges:nodes.reduce((a,n)=>a+n.auth_challenges,0),cancelled:nodes.reduce((a,n)=>a+n.cancelled,0)};
}
function bucket(env:Bindings){if(!env.SCAN_IMAGES)throw new HTTPException(503,{message:'Observatory storage is unavailable'});return env.SCAN_IMAGES;}
function collector(env:Bindings,request:Request){const expected=env.WEBSITE_OBSERVATORY_TOKEN,actual=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!expected||!actual||actual.length!==expected.length||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))throw new HTTPException(401);}
function cutoff(){return Date.now()-retention;}
function validKey(id:string){if(!/^\d{13}-[a-f0-9]{16}$/.test(id))throw new HTTPException(400);return prefix+id+'.json';}
export async function pruneWebsiteObservatory(env:Bindings){if(!env.SCAN_IMAGES)return;const startAfter=prefix+String(9999999999999-cutoff()).padStart(13,'0')+'-z';const list=await env.SCAN_IMAGES.list({prefix,startAfter,limit:100});if(list.objects.length)await env.SCAN_IMAGES.delete(list.objects.map(o=>o.key));}
export function websiteObservatoryRoutes(getUser:(env:Env,request:Request)=>Promise<{is_sysadmin?:boolean}>){
 const app=new Hono<{Bindings:Bindings}>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next();});
 app.get('/collector',async c=>{collector(c.env,c.req.raw);const object=await bucket(c.env).get(controlKey);return c.json(object?await object.json():{requested_at:null});});
 app.post('/collector',async c=>{
  collector(c.env,c.req.raw);if(Number(c.req.header('content-length')||0)>524288)throw new HTTPException(413);
  const reader=c.req.raw.body?.getReader();if(!reader)throw new HTTPException(400);const chunks:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>524288){await reader.cancel();throw new HTTPException(413);}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let parsed:unknown;try{parsed=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HTTPException(400);}
  const checked=schema.safeParse(parsed);if(!checked.success)throw new HTTPException(400,{message:'Invalid synthetic observation'});const run=checked.data,time=Date.parse(run.observed);if(time<cutoff()||time>Date.now()+300000)throw new HTTPException(400);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(run.site+'|'+run.observed+'|'+(run.collector_revision||'')));
  const id=String(9999999999999-time).padStart(13,'0')+'-'+Buffer.from(digest).toString('hex').slice(0,16),summary=summarize(run);
  await bucket(c.env).put(validKey(id),JSON.stringify({...run,id,summary}),{httpMetadata:{contentType:'application/json'},customMetadata:{site:run.site,observed:run.observed,counts:JSON.stringify({requests:summary.requests,bytes:summary.bytes,errors:summary.errors})}});
  return c.json({id},201);
 });
 app.use('*',async(c,next)=>{const user=await getUser(c.env,c.req.raw);if(user.is_sysadmin!==true)throw new HTTPException(403);await next();});
 app.get('/',async c=>{
  const storage=bucket(c.env),list=await storage.list({prefix,limit:200,include:['customMetadata']});
  const objects=list.objects.filter(o=>Date.parse(o.customMetadata?.observed||'')>=cutoff());
  const history=objects.map(o=>({id:o.key.slice(prefix.length,-5),site:o.customMetadata!.site,observed:o.customMetadata!.observed,summary:JSON.parse(o.customMetadata!.counts)}));
  const load=async(id:string)=>{const object=await storage.get(validKey(id));if(!object)return null;const run=await object.json<any>();return Date.parse(run.observed)>=cutoff()?run:null;};
  const runs=(await Promise.all(sites.map(site=>{const row=history.find(r=>r.site===site);return row?load(row.id):null;}))).filter(Boolean);
  const requested=c.req.query('run'),selected=requested?await load(requested):null;
  for(const run of [...runs,...selected?[selected]:[]]){const same=history.filter(h=>h.site===run.site),index=same.findIndex(h=>h.id===run.id),previous=same[index+1];if(previous){const old=await load(previous.id);if(old)previous.summary=old.summary;}}
  const control=await storage.get(controlKey),job=control?await control.json<{requested_at:string}>():null;
  return c.json({schema_version:1,sites,runs,history,selected,retention_days:30,network_metadata:{},error:null,running:Boolean(job&&sites.some(site=>!runs.some(r=>r.site===site&&Date.parse(r.observed)>=Date.parse(job.requested_at))))});
 });
 app.post('/capture',async c=>{await bucket(c.env).put(controlKey,JSON.stringify({requested_at:new Date().toISOString()}));return c.json({queued:true},202);});
 app.delete('/:id',async c=>{await bucket(c.env).delete(validKey(c.req.param('id')));return c.body(null,204);});
 return app;
}
