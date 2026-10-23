import { organizationMemberTitleRoutes } from '../src/organizationMemberTitles';
import { registerPersonnelInvitationTools } from '../src/personnelInvitationsMcp';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { organizationInvitationRoutes, invitationMessage, runOrganizationInvitations } from '../src/organizationInvitations';
class Database {
 sql=new DatabaseSync(':memory:');
 constructor(){
  this.sql.exec('PRAGMA foreign_keys=ON');const dir=new URL('../migrations/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())this.sql.exec(readFileSync(new URL(name,dir),'utf8'));
  this.sql.exec("INSERT INTO organizations(id,name,slug) VALUES('one','One','one'),('two','Two','two'),('related','Related','related'); INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES('one','chair','owner','active'),('one','second','administrator','active'),('one','member','member','active'),('two','chair','member','active'),('related','donor-member','member','active');");
 }
 prepare(sql:string){const stmt=this.sql.prepare(sql);const bound=(values:unknown[]=[])=>({bind:(...v:unknown[])=>bound(v),first:async<T>()=>(stmt.get(...values as [])||null) as T|null,all:async<T>()=>({results:stmt.all(...values as []) as T[]}),run:async()=>({meta:{changes:Number(stmt.run(...values as []).changes)}})});return bound()}
 async batch(statements:{run:()=>Promise<unknown>}[]){this.sql.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());this.sql.exec('COMMIT');return out}catch(error){this.sql.exec('ROLLBACK');throw error}}
 asD1(){return this as unknown as D1Database}
}

function fixture(t:{after:(f:()=>void)=>void}){
 const db=new Database();t.after(()=>db.sql.close());
 const app=organizationInvitationRoutes(async(_env,req)=>({id:req.headers.get('Authorization')||'outsider',email:req.headers.get('X-Email'),identity_data:{email_verified:req.headers.get('X-Verified')==='true'}}));
 async function request(path:string,user='chair',body?:Record<string,unknown>,email='new@example.test',verified=true){return app.request(path,{method:body?'POST':'GET',headers:{Authorization:user,'Content-Type':'application/json','X-Email':email,'X-Verified':String(verified)},...(body?{body:JSON.stringify(body)}:{})},{DB:db.asD1()} as Env)}
 async function act(path:string,user:string,body:Record<string,unknown>,email='new@example.test'){const preview=await request(path+'/preview',user,body,email);assert.equal(preview.status,200,await preview.clone().text());const data=await preview.json() as {previewId:string};return request(path+'/apply',user,{...body,previewId:data.previewId,confirm:true},email)}
 async function issue(purpose='member',user='chair'){const response=await act('/orgs/one/invitations',user,{email:'NEW@example.test',purpose});assert.equal(response.status,200,await response.clone().text());return String(db.sql.prepare('SELECT id FROM organization_invitations WHERE purpose=?').get(purpose)!.id)}
 return{db,request,act,issue};
}
test('verified recipient must explicitly accept; wrong email, unverified, replay denied',async t=>{
 const f=fixture(t),id=await f.issue();
 assert.equal((await f.request('/invitations/'+id,'new',undefined,'wrong@example.test')).status,403);
 assert.equal((await f.request('/invitations/'+id,'new',undefined,'new@example.test',false)).status,403);
 assert.equal((await f.request('/invitations/'+id,'new')).status,200);
 assert.equal(f.db.sql.prepare("SELECT count(*) AS n FROM organization_memberships WHERE user_id='new'").get()!.n,0);
 assert.equal((await f.request('/invitations/'+id+'/apply','new',{confirm:true})).status,409);
 assert.equal((await f.act('/invitations/'+id,'new',{})).status,200);
 assert.equal(f.db.sql.prepare("SELECT role FROM organization_memberships WHERE user_id='new'").get()!.role,'member');
 assert.equal((await f.request('/invitations/'+id,'new')).status,409);
});
test('member volunteer invitation grants no membership privileges',async t=>{
 const f=fixture(t);
 assert.equal((await f.request('/orgs/one/invitations/preview','member',{email:'new@example.test',purpose:'member'})).status,403);
 const id=await f.issue('volunteer','member');assert.equal((await f.act('/invitations/'+id,'new',{})).status,200);
 assert.equal(f.db.sql.prepare("SELECT count(*) AS n FROM organization_memberships WHERE user_id='new'").get()!.n,0);
 assert.equal(f.db.sql.prepare("SELECT awarded_by FROM organization_volunteer_awards WHERE user_id='new'").get()!.awarded_by,'member');
});
test('expiry, duplicate invitations, and live inviter permission',async t=>{
 const f=fixture(t),id=await f.issue();await f.issue();
 assert.equal(f.db.sql.prepare('SELECT count(*) AS n FROM organization_invitations').get()!.n,1);
 f.db.sql.exec("UPDATE organization_memberships SET status='inactive' WHERE user_id='chair'");assert.equal((await f.request('/invitations/'+id,'new')).status,409);
 f.db.sql.exec("UPDATE organization_memberships SET status='active' WHERE user_id='chair'; UPDATE organization_invitations SET expires_at=1");assert.equal((await f.request('/invitations/'+id,'new')).status,409);
});
test('existing organizer role retained and disabled transport does not send',async t=>{
 const f=fixture(t),id=await f.issue();assert.equal((await f.act('/invitations/'+id,'second',{})).status,200);
 assert.equal(f.db.sql.prepare("SELECT role FROM organization_memberships WHERE user_id='second' AND organization_id='one'").get()!.role,'administrator');
 await runOrganizationInvitations({DB:f.db.asD1(),EMAIL_SENDING_ENABLED:'false'} as Env);
});
test('mail safely renders invitation link and separates volunteer permissions',()=>{
 const mail=invitationMessage('https://portal.example','test-id','<script>bad</script>','volunteer');
 assert.ok(mail.html.includes('&lt;script&gt;'));assert.ok(!mail.html.includes('<script>'));
 assert.ok(mail.text.includes('https://portal.example/invitations/test-id'));assert.ok(mail.text.includes('no membership permissions'));
});
test('durable invitation outbox uses Gmail adapter once; ambiguous sends are not retried',async t=>{
 const f=fixture(t),id=await f.issue();
 const {encryptSecret}=await import('../src/emailShared');
 const env={DB:f.db.asD1(),EMAIL_SENDING_ENABLED:'true',EMAIL_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),EMAIL_GOOGLE_CLIENT_ID:'dummy',EMAIL_GOOGLE_CLIENT_SECRET:'dummy',EMAIL_GOOGLE_REDIRECT_URI:'https://portal.example/api/email/google/callback',PUBLIC_PORTAL_BASE_URL:'https://portal.example'} as Env;
 const encrypted=await encryptSecret(env,'local-fake-refresh-token','sender:chair:sender@example.test');
 f.db.sql.prepare('INSERT INTO email_senders(owner_user_id,email,refresh_token_ciphertext,connected_at) VALUES(?,?,?,?)').run('chair','sender@example.test',encrypted,Date.now());
 let sends=0;
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original});
 globalThis.fetch=async(input,init)=>{
  if(String(input)==='https://oauth2.googleapis.com/token')return Response.json({access_token:'local-fake-access-token'});
  assert.equal(String(input),'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');sends++;
  const encoded=JSON.parse(String(init!.body)).raw as string;
  const mime=Buffer.from(encoded,'base64url').toString('utf8');
  assert.ok(mime.includes('To: new@example.test'));
  assert.ok(mime.includes('/invitations/'+id));
  throw new Error('Simulated lost response');
 };
 await runOrganizationInvitations(env);await runOrganizationInvitations(env);
 assert.equal(sends,1);
 assert.equal(f.db.sql.prepare('SELECT email_status FROM organization_invitations WHERE id=?').get(id)!.email_status,'uncertain');
 assert.equal(f.db.sql.prepare('SELECT lease_until FROM email_senders').get()!.lease_until,0);
});

test('delivery progress does not invalidate recipient preview',async t=>{
 const f=fixture(t),id=await f.issue();
 const preview=await f.request('/invitations/'+id+'/preview','new',{});const data=await preview.json() as {previewId:string};
 f.db.sql.exec("UPDATE organization_invitations SET email_status='sent',attempts=1");
 assert.equal((await f.request('/invitations/'+id+'/apply','new',{previewId:data.previewId,confirm:true})).status,200);
});

test('consented external relationships publish without membership; restricted classes require evidence and live manager confirmation',async t=>{
 const f=fixture(t);f.db.sql.exec("INSERT INTO organization_personnel_schemes VALUES('one','corporation')");
 const intent={scheme:'corporation',classes:['advisor','board'],access:'none'};
 const issued=await f.act('/orgs/one/invitations','chair',{email:'new@example.test',purpose:'volunteer',intent});assert.equal(issued.status,200,await issued.clone().text());
 const {invitationId}=await issued.json() as {invitationId:string};
 const review=await (await f.request('/invitations/'+invitationId,'new')).json() as {effect:string};assert.match(review.effect,/No portal membership access/);
 assert.equal((await f.act('/invitations/'+invitationId,'new',{})).status,200);
 assert.equal(f.db.sql.prepare("SELECT count(*) n FROM organization_memberships WHERE user_id='new'").get()!.n,0);
 assert.equal(f.db.sql.prepare("SELECT count(*) n FROM organization_volunteer_awards WHERE user_id='new'").get()!.n,0);
 const rows=f.db.sql.prepare("SELECT class_key,status FROM organization_personnel_relationships WHERE user_id='new' ORDER BY class_key").all();
 assert.deepEqual(rows.map(r=>[r.class_key,r.status]),[['advisor','active'],['board','pending_confirmation']]);
 const pub=organizationMemberTitleRoutes(async()=>({id:'outsider'}),()=>new Response('error',{status:500}));
 const publicPeople=async()=>await (await pub.request('/public/one/personnel',{}, {DB:f.db.asD1()} as Env)).json() as {people:{titles:string[]}[]};
 assert.deepEqual((await publicPeople()).people[0].titles,['Advisor']);
 const action={userId:'new',scheme:'corporation',classKey:'board',action:'confirm',evidenceUrl:'https://example.test/board-resolution'};
 assert.equal((await f.request('/orgs/one/relationships/preview','member',action)).status,403);
 assert.equal((await f.request('/orgs/two/relationships/preview','chair',action)).status,403);
 assert.equal((await f.request('/orgs/one/relationships/preview','chair',{...action,evidenceUrl:undefined})).status,400);
 assert.equal((await f.act('/orgs/one/relationships','chair',action)).status,200);
 assert.deepEqual((await publicPeople()).people[0].titles.sort(),['Advisor','Board member']);
 const text=JSON.stringify(await publicPeople());assert.ok(!text.includes('new@example.test'));assert.ok(!text.includes('board-resolution'));
 const removal=await f.request('/orgs/one/relationships/preview','new',{...action,action:'revoke',evidenceUrl:undefined});
 const removalText=await removal.text();assert.ok(!removalText.includes('board-resolution'));
 assert.equal((await f.request('/orgs/one/relationships/apply','new',{userId:'new',scheme:'corporation',classKey:'board',action:'revoke',previewId:JSON.parse(removalText).previewId,confirm:true})).status,200);
 assert.deepEqual((await publicPeople()).people[0].titles,['Advisor']);
});
test('intent conflicts, class validation, cancellation, manager status and optional membership are explicit',async t=>{
 const f=fixture(t);f.db.sql.exec("INSERT INTO organization_personnel_schemes VALUES('one','nonprofit')");
 const args={email:'new@example.test',purpose:'member',intent:{scheme:'nonprofit',classes:['advisor'],access:'member'}};
 assert.equal((await f.request('/orgs/one/invitations/preview','member',args)).status,403);
 assert.equal((await f.request('/orgs/one/invitations/preview','chair',{...args,intent:{...args.intent,classes:['shareholder']}})).status,400);
 const issued=await f.act('/orgs/one/invitations','chair',args);const {invitationId}=await issued.json() as {invitationId:string};
 assert.equal((await f.act('/orgs/one/invitations','chair',{...args,intent:{...args.intent,classes:['member']}})).status,409);
 assert.equal((await f.request('/orgs/one/invitations','outsider')).status,403);
 await runOrganizationInvitations({DB:f.db.asD1(),EMAIL_SENDING_ENABLED:'false'} as Env);
 const list=await (await f.request('/orgs/one/invitations')).json() as {invitations:{delivery_blocker:string}[]};assert.equal(list.invitations[0].delivery_blocker,'sending_disabled');
 assert.equal((await f.act('/orgs/one/invitations/'+invitationId+'/cancel','chair',{})).status,200);
 assert.equal((await f.request('/invitations/'+invitationId,'new')).status,409);
 const replacement=await f.act('/orgs/one/invitations','chair',args);const next=await replacement.json() as {invitationId:string};
 assert.notEqual(next.invitationId,invitationId);
 assert.equal((await f.act('/invitations/'+next.invitationId,'new',{})).status,200);
 assert.equal(f.db.sql.prepare("SELECT role FROM organization_memberships WHERE organization_id='one' AND user_id='new'").get()!.role,'member');
});
test('MCP uses the same lifecycle, scopes, tenant binding and verified-recipient acceptance',async t=>{
 const f=fixture(t);f.db.sql.exec("INSERT INTO organization_personnel_schemes VALUES('one','corporation')");
 function tools(userId:string,scopes=['org:portal.read','org:portal.write'],organizationId='one',verified=true){
  const registered=new Map<string,(args:any)=>Promise<any>>();
  registerPersonnelInvitationTools({registerTool:(name:string,_config:unknown,callback:any)=>registered.set(name,callback)} as any,{DB:f.db.asD1()} as Env,{userId,scopes,email:'new@example.test',emailVerified:verified},{organizationId},()=>({}));return registered;
 }
 const manager=tools('chair'),args={organizationId:'one',email:'new@example.test',purpose:'volunteer',intent:{scheme:'corporation',classes:['advisor'],access:'none'}};
 const preview=await manager.get('preview_organization_invitation')!({...args,purpose:undefined});assert.equal(preview.isError,false);
 const receipt=JSON.parse(preview.content[0].text);
 const applied=await manager.get('apply_organization_invitation')!({...args,previewId:receipt.previewId,confirm:true});assert.equal(applied.isError,false);
 const {invitationId}=JSON.parse(applied.content[0].text),target={organizationId:'one',invitationId};
 assert.equal((await tools('new',undefined,'two').get('get_organization_invitation')!({...target,organizationId:'two'})).isError,true);
 assert.equal((await tools('new',undefined,'one',false).get('preview_organization_invitation_acceptance')!(target)).isError,true);
 const recipient=tools('new');const accept=await recipient.get('preview_organization_invitation_acceptance')!(target);assert.equal(accept.isError,false);
 assert.equal((await recipient.get('apply_organization_invitation_acceptance')!({...target,confirm:true,previewId:JSON.parse(accept.content[0].text).previewId})).isError,false);
 assert.equal((await tools('chair',['org:portal.read']).get('apply_organization_invitation')!({...args,confirm:true,previewId:receipt.previewId})).isError,true);
 assert.equal((await manager.get('list_organization_invitations')!({organizationId:'two'})).isError,true);
});
