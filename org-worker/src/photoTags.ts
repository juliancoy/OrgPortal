import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { resolvePortalTenant } from './timebank';
import { authorizeOrganization, type OrganizationActor } from './organizationIam';
import { MEDTECH_CAROUSEL, publicDriveFolder } from './driveCarousel';
import { claimEventOperation, enforceEventRateLimit, finishEventOperation, prepareEventOperation, previewFingerprint } from './eventOperationStore';

const region = z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().positive().max(1),height:z.number().positive().max(1)}).strict().refine(b=>b.x+b.width<=1&&b.y+b.height<=1);
export const photoTagSchema = z.array(z.object({label:z.string().trim().min(1).max(100),region:region.optional()}).strict()).max(30);
const bodySchema = z.object({tags:photoTagSchema,confirm:z.boolean().default(false),previewId:z.string().uuid().optional()}).strict();
async function boundedJson(request: Request) {
 const reader=request.body?.getReader();if(!reader)throw new HTTPException(400,{message:'Tags are required.'});
 const chunks:Uint8Array[]=[];let length=0;
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>16384){await reader.cancel();throw new HTTPException(413,{message:'Tag request is too large.'});}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HTTPException(400,{message:'Invalid JSON.'});}
}
export function photoTagRoutes(getActor:(env:Env,request:Request)=>Promise<OrganizationActor>,loadFolder=publicDriveFolder) {
 const app=new Hono<{Bindings:Env}>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','private, no-store');await next();});
 app.onError((error,c)=>{const status=error instanceof HTTPException?error.status:((error as {status?:number}).status||500);return new Response(JSON.stringify({error:status===500?'Unable to update photo tags.':error.message}),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});});
 async function target(env:Env,request:Request,source:string,owner:string,photo:string){
  const tenant=await resolvePortalTenant(env.DB,request);
  let ownerId=owner,organizationId:string|null|undefined;
  if(source==='carousel'){
   if(owner!==MEDTECH_CAROUSEL.id||!MEDTECH_CAROUSEL.tenantHostnames.includes(tenant.hostname))throw new HTTPException(404);
   if(!(await loadFolder()).images.some(image=>image.id===photo))throw new HTTPException(404,{message:'Photo not found.'});
   organizationId=tenant.organization_id||(await env.DB.prepare('SELECT id FROM organizations WHERE slug=?').bind(tenant.home_org_slug||'').first<{id:string}>())?.id;
  }else if(source==='event'||source==='organization'){
   const sql=source==='event'?'SELECT id,host_org_id AS organization_id,media_json FROM events WHERE id=? OR slug=?':'SELECT id,id AS organization_id,media_json FROM organizations WHERE id=? OR slug=?';
   const row=await env.DB.prepare(sql).bind(owner,owner).first<{id:string;organization_id:string|null;media_json:string}>();
   if(!row||!(JSON.parse(row.media_json||'[]') as Array<{id:string}>).some(item=>item.id===photo))throw new HTTPException(404,{message:'Photo not found.'});
   ownerId=row.id;organizationId=row.organization_id;
  }else throw new HTTPException(404);
  if(!organizationId)throw new HTTPException(409,{message:'Photo tagging requires an organization gallery.'});
  const key=[tenant.id,source,ownerId,photo];
  const existing=await env.DB.prepare('SELECT tags_json,version FROM photo_annotations WHERE tenant_id=? AND source=? AND owner_id=? AND photo_id=?').bind(...key).first<{tags_json:string;version:number}>();
  return {key,organizationId,existing,tags:JSON.parse(existing?.tags_json||'[]')};
 }
 app.get('/:source/:owner/:photo',async c=>{
  const t=await target(c.env,c.req.raw,c.req.param('source'),c.req.param('owner'),c.req.param('photo'));
  let canEdit=false;
  if(c.req.header('authorization')){
   try{await authorizeOrganization(c.env.DB,await getActor(c.env,c.req.raw),'manage',t.organizationId);canEdit=true;}
   catch(error){if(![401,403].includes((error as {status?:number}).status||500))throw error;}
  }
  return c.json({tags:t.tags,canEdit});
 });
 app.post('/:source/:owner/:photo',async c=>{
  const actor=await getActor(c.env,c.req.raw);
  const t=await target(c.env,c.req.raw,c.req.param('source'),c.req.param('owner'),c.req.param('photo'));
  await authorizeOrganization(c.env.DB,actor,'manage',t.organizationId);
  const origin=c.req.header('origin');const host=c.req.header('x-forwarded-host')||new URL(c.req.url).host;
  if(origin&&origin!==`https://${host}`&&origin!==new URL(c.req.url).origin)throw new HTTPException(403,{message:'Origin denied.'});
  await enforceEventRateLimit(c.env.DB,actor.id);
  const parsed=bodySchema.safeParse(await boundedJson(c.req.raw));if(!parsed.success)throw new HTTPException(400,{message:'Use up to 30 names, each at most 100 characters, and valid photo regions.'});
  const {tags,confirm,previewId}=parsed.data;
  const preview={photo:t.key,before:t.tags,after:tags,version:t.existing?.version??0};
  const fingerprint=await previewFingerprint({operation:'photo-tags',preview});
  const owner={userId:actor.id,organizationId:t.organizationId,eventId:`photo-tags:${JSON.stringify(t.key)}`};
  if(!confirm)return c.json({dryRun:true,...preview,...await prepareEventOperation(c.env.DB,owner,fingerprint)});
  if(!previewId)throw new HTTPException(409,{message:'Preview the tags before saving.'});
  await claimEventOperation(c.env.DB,owner,previewId,fingerprint);
  try{
   const updated=await c.env.DB.prepare(`INSERT INTO photo_annotations(tenant_id,source,owner_id,photo_id,tags_json,version,updated_by_user_id)
    VALUES (?,?,?,?,?,1,?) ON CONFLICT(tenant_id,source,owner_id,photo_id) DO UPDATE SET tags_json=excluded.tags_json,version=photo_annotations.version+1,updated_by_user_id=excluded.updated_by_user_id,updated_at=CURRENT_TIMESTAMP WHERE photo_annotations.version=? RETURNING version`)
    .bind(...t.key,JSON.stringify(tags),actor.id,preview.version).first();
   if(!updated)throw new HTTPException(409,{message:'Photo tags changed. Review them again.'});
   await finishEventOperation(c.env.DB,previewId,true,['photo-tags-saved']);
  }catch(error){await finishEventOperation(c.env.DB,previewId,false,[]);throw error;}
  return c.json({tags,canEdit:true});
 });
 return app;
}
