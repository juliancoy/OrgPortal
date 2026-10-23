import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync,readFileSync } from 'node:fs';
import { HTTPException } from 'hono/http-exception';
import { presentationRoutes } from '../src/eventPresentations';
import { attachmentType,cleanupPresentationAttachments } from '../src/presentationAttachments';
function fixture(t:{after:(fn:()=>void)=>void}){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');t.after(()=>sql.close());
 const dir=new URL('../migrations/',import.meta.url);for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())sql.exec(readFileSync(new URL(name,dir),'utf8'));
 sql.exec(`INSERT INTO organizations(id,name,slug) VALUES('host','Host','host'),('team','Team','team');
 INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES('host','manager','owner','active'),('team','applicant','owner','active');
 INSERT INTO events(id,ingest_key,slug,title,host_org_id,starts_at) VALUES('event','event','event','Event','host','2099-01-01');
 INSERT INTO event_presentation_submissions VALUES('event','team','applicant','Demo','Summary','submitted','2026-01-01','2099-06-01');`);
 const db={prepare:(q:string)=>{const statement=sql.prepare(q);const bound=(values:unknown[]=[])=>({bind:(...v:unknown[])=>bound(v),first:async()=>statement.get(...values as [])||null,all:async()=>({results:statement.all(...values as [])}),run:async()=>({meta:statement.run(...values as [])})});return bound()}} as unknown as D1Database;
 const objects=new Map<string,Uint8Array>();let failDelete=false;
 const bucket={put:async(key:string,bytes:Uint8Array)=>{objects.set(key,bytes)},get:async(key:string)=>objects.has(key)?{body:new Blob([objects.get(key)!]).stream()}:null,delete:async(key:string)=>{if(failDelete)throw new Error('storage unavailable');objects.delete(key)}} as unknown as R2Bucket;
 const app=presentationRoutes(async(_env,request)=>{const id=request.headers.get('Authorization');if(!id)throw new HTTPException(401);return{id}});
 app.onError((error,c)=>c.json({message:error.message},error instanceof HTTPException?error.status:500));
 const request=(suffix:string,method='GET',user='',body?:FormData,headers:Record<string,string>={})=>app.request('/event/presentations'+suffix,{method,headers:{...headers,...(user?{Authorization:user}:{})},...(body?{body}:{})},{DB:db,SCAN_IMAGES:bucket});
 const upload=(name='slides.pdf',bytes:Uint8Array|string='%PDF-1.4\nExample',id=crypto.randomUUID())=>{const form=new FormData();form.set('id',id);form.set('file',new File([bytes],name));return{id,form}};
 return{sql,db,bucket,objects,request,upload,setDeleteFailure:(value:boolean)=>{failDelete=value}};
}
test('validates supported file signatures and excludes active browser content',()=>{
 assert.equal(attachmentType('SLIDES.PDF',new TextEncoder().encode('%PDF-1.4')),'application/pdf');
 assert.equal(attachmentType('slides.pptx',new Uint8Array([80,75,3,4])),'application/vnd.openxmlformats-officedocument.presentationml.presentation');
 for(const name of ['bad.svg','bad.html','fake.pdf','fake.png'])assert.throws(()=>attachmentType(name,new TextEncoder().encode('<script>alert(1)</script>')),HTTPException);
});
test('team and event managers upload; everyone can list and download; retries do not duplicate files',async t=>{
 const f=fixture(t),file=f.upload();
 assert.equal((await f.request('/team/attachments','POST','outsider',file.form)).status,403);
 const response=await f.request('/team/attachments','POST','applicant',file.form);assert.equal(response.status,201,await response.clone().text());
 const data=await response.json() as {id:string};assert.equal(data.id,file.id);
 assert.equal((await f.request('/team/attachments','POST','applicant',file.form)).status,200);assert.equal(f.objects.size,1);
 const changed=f.upload('changed.pdf','%PDF-1.4\nChanged',file.id);assert.equal((await f.request('/team/attachments','POST','applicant',changed.form)).status,409);
 const publicList=await(await f.request('/submissions')).json() as {submissions:{attachments:unknown[]}[]};assert.equal(publicList.submissions[0].attachments.length,1);assert.ok(!JSON.stringify(publicList).includes('object_key'));
 const downloaded=await f.request('/team/attachments/'+file.id);assert.equal(downloaded.status,200);assert.equal(await downloaded.text(),'%PDF-1.4\nExample');assert.match(downloaded.headers.get('Content-Disposition')!,/^attachment/);assert.equal(downloaded.headers.get('X-Content-Type-Options'),'nosniff');
 assert.equal((await f.request('/team/attachments/'+file.id,'DELETE','outsider')).status,403);
 assert.equal((await f.request('/team/attachments/'+file.id,'DELETE','manager')).status,200);assert.equal(f.objects.size,0);
});
test('caps uploads, rejects invalid content, and cleans withdrawn files without losing failed deletions',async t=>{
 const f=fixture(t);
 const oversized=f.upload();assert.equal((await f.request('/team/attachments','POST','applicant',oversized.form,{'Content-Length':String(22*1024*1024)})).status,413);
 const empty=f.upload('empty.pdf','');assert.equal((await f.request('/team/attachments','POST','applicant',empty.form)).status,413);
 const invalid=f.upload('pretend.pdf','not a pdf');assert.equal((await f.request('/team/attachments','POST','applicant',invalid.form)).status,415);
 for(let n=0;n<10;n++){const file=f.upload('slides-'+n+'.pdf');assert.equal((await f.request('/team/attachments','POST','applicant',file.form)).status,201)}
 const extra=f.upload();assert.equal((await f.request('/team/attachments','POST','manager',extra.form)).status,409);
 const id=f.sql.prepare('SELECT id FROM event_presentation_attachments LIMIT 1').get()!.id;
 f.sql.exec('DELETE FROM event_presentation_submissions');assert.equal((await f.request('/team/attachments/'+id)).status,404);
 f.setDeleteFailure(true);await assert.rejects(cleanupPresentationAttachments(f.db,f.bucket,Date.now()));assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM event_presentation_attachments').get()!.n,10);
 f.setDeleteFailure(false);assert.equal(await cleanupPresentationAttachments(f.db,f.bucket,Date.now()),10);assert.equal(f.objects.size,0);
});
