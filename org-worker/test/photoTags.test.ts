import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {Hono} from 'hono';
import {HTTPException} from 'hono/http-exception';
import {TimebankDatabase} from './helpers/timebankDatabase';
import {photoTagRoutes,photoTagSchema} from '../src/photoTags';

test('photo tags require live gallery permissions and a reviewed, unreplayed preview',async()=>{
 const db=new TimebankDatabase();
 db.sqlite.exec('CREATE TABLE organizations(id TEXT PRIMARY KEY,name TEXT,slug TEXT,media_json TEXT); CREATE TABLE events(id TEXT PRIMARY KEY,slug TEXT,host_org_id TEXT,media_json TEXT);');
 for(const file of ['0015_organization_iam.sql','0017_event_mcp_operations.sql','0054_photo_tags.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 db.sqlite.exec(`INSERT INTO organizations VALUES ('org','MedTech','baltimore-medtech','[{"id":"photo"}]'); INSERT INTO events VALUES ('event','meetup','org','[{"id":"photo"}]'); INSERT INTO organization_memberships(organization_id,user_id,role) VALUES ('org','admin','administrator'),('org','member','member')`);
 const actor=async(_env:Env,request:Request)=>{const id=request.headers.get('authorization');if(!id)throw new HTTPException(401);return {id,name:id,email:null,isOperator:false}};
 const folder=async()=>({title:'Photos',folderUrl:'https://drive.google.com',images:[{id:'photo',name:'Photo',imageUrl:'https://example.com/photo',driveUrl:'https://drive.google.com'}]});
 const app=new Hono<{Bindings:Env}>();app.route('/tags',photoTagRoutes(actor,folder));
 const req=(path='/event/event/photo',body?:unknown,user='',host='medtech.social')=>app.fetch(new Request(`https://${host}/tags${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{authorization:user}:{})},body:body?JSON.stringify(body):undefined}),{DB:db.asD1()} as Env);
 const tags=[{label:'Alex',region:{x:.1,y:.1,width:.2,height:.2}}];
 try{
  assert.deepEqual(await (await req()).json(),{tags:[],canEdit:false});
  assert.equal((await req(undefined,{tags})).status,401);
  assert.equal((await req(undefined,{tags},'member')).status,403);
  assert.equal((await req(undefined,{tags,confirm:true},'admin')).status,409);
  const preview:any=await (await req(undefined,{tags},'admin')).json();assert.ok(preview.previewId);
  assert.deepEqual((await (await req()).json() as any).tags,[]);
  assert.equal((await req(undefined,{tags:[{label:'Changed'}],confirm:true,previewId:preview.previewId},'admin')).status,409);
  assert.equal((await req(undefined,{tags,confirm:true,previewId:preview.previewId},'admin')).status,200);
  assert.deepEqual((await (await req()).json() as any).tags,tags);
  assert.equal((await req(undefined,{tags,confirm:true,previewId:preview.previewId},'admin')).status,409);
  assert.deepEqual((await (await req(undefined,undefined,'','codecollective.us')).json() as any).tags,[]);
  const second:any=await (await req(undefined,{tags:[]},'admin')).json();
  db.sqlite.exec("UPDATE organization_memberships SET status='inactive' WHERE user_id='admin'");
  assert.equal((await req(undefined,{tags:[],confirm:true,previewId:second.previewId},'admin')).status,403);
  assert.equal((await req('/event/event/absent')).status,404);
  assert.equal((await req('/carousel/medtech-photos/photo',undefined,'','codecollective.us')).status,404);
  assert.equal((await req('/carousel/medtech-photos/photo')).status,200);
  assert.equal((await req('/organization/org/photo')).status,200);
  assert.equal((await req(undefined,{tags:[{label:'Alex',faceEmbedding:[1]}]},'member')).status,403);
 }finally{db.sqlite.close()}
});
test('tags contain only reviewed labels and bounded regions',()=>{
 for(const invalid of [[{label:''}],[{label:'Alex',faceEmbedding:[1]}],[{label:'Alex',region:{x:.9,y:0,width:.2,height:.1}}],Array.from({length:31},()=>({label:'Alex'}))])assert.equal(photoTagSchema.safeParse(invalid).success,false);
 assert.equal(photoTagSchema.safeParse([{label:'Alex'}]).success,true);
});
