import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { organizationRole } from './organizationIam';

export const ATTACHMENT_MAX_BYTES=20*1024*1024;
export const ATTACHMENT_MAX_FILES=10;
type Environment={DB:D1Database;SCAN_IMAGES?:R2Bucket};
type Attachment={id:string;event_id:string;organization_id:string;submission_id:string;name:string;content_type:string;size:number;sha256:string;object_key:string;state:string;created_at:string;expires_at:string};
const mime:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',pdf:'application/pdf',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',txt:'text/plain',csv:'text/csv',md:'text/markdown',zip:'application/zip'};
function fail(status:400|403|404|409|413|415|503,message:string):never {throw new HTTPException(status,{message})}
export function attachmentType(name:string,bytes:Uint8Array){
 const extension=name.split('.').pop()?.toLowerCase()||'',type=mime[extension];
 if(!type)fail(415,'Unsupported file. Choose an image, PDF, Office document, text file or ZIP.');
 const starts=(signature:number[])=>signature.every((value,index)=>bytes[index]===value);
 let valid=false;
 if(extension==='png')valid=starts([137,80,78,71,13,10,26,10]);
 else if(extension==='jpg'||extension==='jpeg')valid=starts([255,216,255]);
 else if(extension==='gif')valid=['GIF87a','GIF89a'].includes(new TextDecoder().decode(bytes.slice(0,6)));
 else if(extension==='webp')valid=new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
 else if(extension==='pdf')valid=new TextDecoder().decode(bytes.slice(0,5))==='%PDF-';
 else if(['ppt','doc','xls'].includes(extension))valid=starts([208,207,17,224,161,177,26,225]);
 else if(['pptx','docx','xlsx','zip'].includes(extension))valid=starts([80,75,3,4]);
 else {try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);valid=!bytes.includes(0)}catch{/* Not a text document. */}}
 if(!valid)fail(415,'The file contents do not match its supported file extension.');
 return type;
}
async function formData(request:Request){
 const maximum=ATTACHMENT_MAX_BYTES+65536;
 if(Number(request.headers.get('Content-Length'))>maximum)fail(413,'Files must be 20 MB or smaller.');
 if(!request.body)fail(400,'Choose a file.');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const result=await reader.read();if(result.done)break;size+=result.value.byteLength;if(size>maximum){await reader.cancel();fail(413,'Files must be 20 MB or smaller.')}chunks.push(result.value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 try{return await new Response(bytes,{headers:{'Content-Type':request.headers.get('Content-Type')||''}}).formData()}catch{fail(400,'Multipart form data is required.')}
}
async function parent(db:D1Database,event:string,org:string){
 const row=await db.prepare("SELECT s.expires_at,s.organization_id,e.host_org_id FROM event_submissions s JOIN events e ON e.id=s.event_id WHERE s.event_id=? AND s.submission_id=? AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(event,org).first<{expires_at:string;organization_id:string;host_org_id:string|null}>();
 if(!row)fail(404,'Submission not found.');return row;
}
async function manage(db:D1Database,user:string,event:string,org:string){
 const submission=await parent(db,event,org);
 const roles=await Promise.all([organizationRole(db,submission.organization_id,user),submission.host_org_id?organizationRole(db,submission.host_org_id,user):Promise.resolve(null)]);
 if(!roles.some(role=>role==='owner'||role==='administrator'))fail(403,'Team or event management access is required.');
 return submission;
}
export function publicAttachment(row:Pick<Attachment,'id'|'name'|'content_type'|'size'>){return{id:row.id,name:row.name,contentType:row.content_type,size:row.size}}
export function presentationAttachmentRoutes<E extends Environment>(auth:(env:E,request:Request)=>Promise<{id:string}>){
 const app=new Hono<{Bindings:E}>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next()});
 app.get('/:id/presentations/:org/attachments',async c=>{
  await parent(c.env.DB,c.req.param('id'),c.req.param('org'));
  const rows=await c.env.DB.prepare("SELECT id,name,content_type,size FROM event_presentation_attachments WHERE event_id=? AND submission_id=? AND state='ready' ORDER BY created_at,id").bind(c.req.param('id'),c.req.param('org')).all<Attachment>();
  return c.json({attachments:rows.results.map(publicAttachment)});
 });
 app.post('/:id/presentations/:org/attachments',async c=>{
  const user=await auth(c.env,c.req.raw),event=c.req.param('id'),org=c.req.param('org');await manage(c.env.DB,user.id,event,org);
  const bucket=c.env.SCAN_IMAGES;if(!bucket)fail(503,'Attachment storage is not configured.');
  const form=await formData(c.req.raw),file=form.get('file'),id=form.get('id');
  if(!(file instanceof File))fail(400,'Choose a file.');
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))fail(400,'A valid upload identifier is required.');
  if(!file.size||file.size>ATTACHMENT_MAX_BYTES)fail(413,'Choose a nonempty file, 20 MB or smaller.');
  const name=file.name.replace(/[\x00-\x1f\x7f"\\/]/g,'_').slice(-160),bytes=new Uint8Array(await file.arrayBuffer()),type=attachmentType(name,bytes);
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  await manage(c.env.DB,user.id,event,org);const objectKey=`submission-attachments/${id}`;
  await c.env.DB.prepare(`INSERT OR IGNORE INTO event_presentation_attachments(id,event_id,organization_id,submission_id,name,content_type,size,sha256,object_key,state,created_at,expires_at)
   SELECT ?,?,s.organization_id,?,?,?,?,?,?,'pending',strftime('%Y-%m-%dT%H:%M:%fZ','now'),s.expires_at FROM event_submissions s
   WHERE s.event_id=? AND s.submission_id=? AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (SELECT COUNT(*) FROM event_presentation_attachments WHERE event_id=? AND submission_id=?)<10`).bind(id,event,org,name,type,file.size,sha256,objectKey,event,org,event,org).run();
  const saved=await c.env.DB.prepare('SELECT * FROM event_presentation_attachments WHERE id=?').bind(id).first<Attachment>();
  if(!saved)fail(409,'A submission may have at most 10 attachments. Remove one before adding another.');
  if(saved.event_id!==event||saved.submission_id!==org||saved.sha256!==sha256||saved.name!==name)fail(409,'Upload identifier is already in use.');
  if(saved.state==='ready')return c.json(publicAttachment(saved));
  // Keep pending metadata on failure so retries and cleanup retain the object key.
  await bucket.put(objectKey,bytes,{httpMetadata:{contentType:type}});
  const current=await manage(c.env.DB,user.id,event,org);
  const published=await c.env.DB.prepare("UPDATE event_presentation_attachments SET state='ready',expires_at=? WHERE id=? AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(current.expires_at,id).run();
  if(!published.meta.changes){await bucket.delete(objectKey);fail(409,'This attachment was removed while uploading.')}

  return c.json(publicAttachment(saved),201);
 });
 app.get('/:id/presentations/:org/attachments/:attachment',async c=>{
  await parent(c.env.DB,c.req.param('id'),c.req.param('org'));
  const row=await c.env.DB.prepare("SELECT * FROM event_presentation_attachments WHERE id=? AND event_id=? AND submission_id=? AND state='ready'").bind(c.req.param('attachment'),c.req.param('id'),c.req.param('org')).first<Attachment>();
  if(!row||!c.env.SCAN_IMAGES)fail(404,'Attachment not found.');
  const object=await c.env.SCAN_IMAGES.get(row.object_key);if(!object)fail(404,'Attachment not found.');
  return new Response(object.body,{headers:{'Content-Type':row.content_type,'Content-Length':String(row.size),'Content-Disposition':`${row.content_type.startsWith('image/')?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'no-store'}});
 });
 app.delete('/:id/presentations/:org/attachments/:attachment',async c=>{
  const user=await auth(c.env,c.req.raw);await manage(c.env.DB,user.id,c.req.param('id'),c.req.param('org'));
  const row=await c.env.DB.prepare('SELECT * FROM event_presentation_attachments WHERE id=? AND event_id=? AND submission_id=?').bind(c.req.param('attachment'),c.req.param('id'),c.req.param('org')).first<Attachment>();
  if(row){if(!c.env.SCAN_IMAGES)fail(503,'Attachment storage is not configured.');await c.env.SCAN_IMAGES.delete(row.object_key);await c.env.DB.prepare('DELETE FROM event_presentation_attachments WHERE id=?').bind(row.id).run()}
  return c.json({deleted:true});
 });
 return app;
}
export async function cleanupPresentationAttachments(db:D1Database,bucket:R2Bucket,now:number){
 const rows=await db.prepare(`SELECT id,object_key FROM event_presentation_attachments a WHERE a.expires_at<=? OR (a.state='pending' AND a.created_at<=?) OR NOT EXISTS(SELECT 1 FROM event_submissions s WHERE s.event_id=a.event_id AND s.submission_id=a.submission_id AND s.expires_at>?) ORDER BY a.created_at LIMIT 100`).bind(new Date(now).toISOString(),new Date(now-15*60*1000).toISOString(),new Date(now).toISOString()).all<{id:string;object_key:string}>();
 let deleted=0;for(const row of rows.results){await bucket.delete(row.object_key);await db.prepare('DELETE FROM event_presentation_attachments WHERE id=?').bind(row.id).run();deleted++}return deleted;
}
