import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {TimebankDatabase} from './helpers/timebankDatabase';
import {claimOrganization,saveOrganizationMember} from '../src/organizationIam';
import {notificationPreferenceRoutes,notificationPreferences} from '../src/notificationPreferences';
import {dispatchOrganizationStatusPush,runOrganizationStatusEmail} from '../src/organizationStatusNotifications';
import {consumePushBatch,enqueueUserPush} from '../src/push';
import {encryptSecret} from '../src/emailShared';
function fixture(t:{after:(fn:()=>void)=>void}) {
 const db=new TimebankDatabase();t.after(()=>db.sqlite.close());
 for(const name of ['0002_org_event_directories','0015_organization_iam','0067_pending_organizers','0019_email_campaigns','0029_portal_tenant_deployment_model','0032_portal_tenant_org_slug','0051_onboarding','0064_organization_status_notifications'])db.sqlite.exec(readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8'));
 db.sqlite.exec(`INSERT INTO organizations(id,name,slug,tags) VALUES ('org-1','LifeTech','lifetech','[]'); INSERT INTO user_contact_pages(id,user_id,slug,user_email) VALUES ('contact-1','website-member','member','verified@example.test');`);
 const env={DB:db.asD1(),PUBLIC_PORTAL_BASE_URL:'https://codecollective.us/p',EMAIL_GOOGLE_CLIENT_ID:'client',EMAIL_GOOGLE_CLIENT_SECRET:'secret',EMAIL_GOOGLE_REDIRECT_URI:'https://codecollective.us/api/org/api/email/google/callback',EMAIL_TOKEN_ENCRYPTION_KEY:btoa('k'.repeat(32)),VAPID_PUBLIC_KEY:'public',VAPID_PRIVATE_KEY:'private',VAPID_SUBJECT:'mailto:test@example.test'} as Env;
 return {db,env};
}
const owner={id:'owner',name:'Owner',email:'owner@example.test',isOperator:false};
const member={user_id:'website-member',user_name:'Member',user_email:'untrusted@example.test',role:'member'};
async function addMember(env:Env) {await claimOrganization(env.DB,'org-1',owner,new Date().toISOString());await saveOrganizationMember(env.DB,'org-1',owner,member,new Date().toISOString());}
async function sender(env:Env) {await env.DB.prepare('INSERT INTO email_senders(owner_user_id,email,refresh_token_ciphertext,connected_at) VALUES(?,?,?,?)').bind('sender','sender@example.test',await encryptSecret(env,'refresh','sender:sender:sender@example.test'),Date.now()).run();}
test('claims, role changes, departures and removals capture real transitions inside the membership transaction',async t=>{
 const {db,env}=fixture(t);await addMember(env);await claimOrganization(env.DB,'org-1',owner,new Date().toISOString());await saveOrganizationMember(env.DB,'org-1',owner,member,new Date().toISOString());
 await saveOrganizationMember(env.DB,'org-1',owner,{...member,role:'administrator'},new Date().toISOString());
 db.sqlite.exec("UPDATE organization_memberships SET status='inactive' WHERE user_id='website-member'; DELETE FROM organization_memberships WHERE user_id='website-member';");
 const rows=db.sqlite.prepare('SELECT user_id,previous_role,role,previous_status,status FROM organization_status_notifications ORDER BY rowid').all();
 assert.equal(rows.length,5);assert.equal(rows[0].role,'owner');assert.equal(rows[2].previous_role,'member');assert.equal(rows[2].role,'administrator');assert.equal(rows[3].status,'inactive');assert.equal(rows[4].role,null);
 assert.throws(()=>db.sqlite.exec("BEGIN; INSERT INTO organization_memberships(organization_id,user_id,role) VALUES('org-1','rolled-back','member'); INSERT INTO organizations(id,name,slug,tags) VALUES('org-1','duplicate','duplicate','[]');"));db.sqlite.exec('ROLLBACK');
 assert.equal(db.sqlite.prepare("SELECT count(*) n FROM organization_status_notifications WHERE user_id='rolled-back'").get()!.n,0);
});
test('preferences default on and remain bound to the authenticated account',async t=>{
 const {env}=fixture(t);const routes=notificationPreferenceRoutes(async(_env,request)=>({id:request.headers.get('authorization')==='Bearer owner'?'owner':'website-member',email:'same@example.test'}));
 const request=(method:string,body?:unknown,actor='member')=>routes.request('https://local.test/',{method,headers:{authorization:`Bearer ${actor}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},env);
 const initial=await request('GET');assert.equal(initial.status,200);assert.equal((await initial.json() as {organization_status_email:boolean}).organization_status_email,true);
 assert.equal((await request('PUT',{organization_status_email:false,push_enabled:false})).status,200);
 assert.equal((await notificationPreferences(env.DB,'website-member')).organization_status_email,false);assert.equal((await notificationPreferences(env.DB,'owner')).organization_status_email,true);
 for(const body of [{user_id:'owner',organization_status_email:false},{email:'victim@example.test'},{organization_status_email:'false'}])assert.equal((await request('PUT',body)).status,400);
 await request('GET');assert.equal((await notificationPreferences(env.DB,'website-member')).push_enabled,false);
});
test('push shares the queue and honors account and category opt-outs after enqueue',async t=>{
 const {db,env}=fixture(t);await claimOrganization(env.DB,'org-1',owner,new Date().toISOString());const jobs:unknown[]=[];env.PUSH_QUEUE={send:async(job:unknown)=>{jobs.push(job);}} as unknown as Queue;
 await dispatchOrganizationStatusPush(env);await dispatchOrganizationStatusPush(env);assert.equal(jobs.length,1);
 db.sqlite.exec("INSERT INTO notification_preferences(user_id,organization_status_push) VALUES('owner',0)");let acknowledged=false,retried=false;
 await consumePushBatch({messages:[{body:jobs[0],ack:()=>{acknowledged=true},retry:()=>{retried=true}}]} as unknown as MessageBatch<import('../src/push').PushDeliveryJob>,env);
 assert.equal(acknowledged,true);assert.equal(retried,false);
 db.sqlite.exec("UPDATE notification_preferences SET push_enabled=0 WHERE user_id='owner'");await enqueueUserPush(env,{eventId:'chat-event',userId:'owner',title:'Chat',body:'Message',deepLink:'/chat'});assert.equal(jobs.length,1);
});
test('mail uses verified account addresses, waits for a sender and honors late opt-outs',async t=>{
 const {db,env}=fixture(t);await addMember(env);await runOrganizationStatusEmail(env);assert.equal(db.sqlite.prepare("SELECT email_status FROM organization_status_notifications WHERE user_id='website-member'").get()!.email_status,'queued');await sender(env);let sent=0;
 t.mock.method(globalThis,'fetch',async(input:unknown,init?:RequestInit)=>{if(String(input)==='https://oauth2.googleapis.com/token')return Response.json({access_token:'access'});assert.equal(String(input),'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');sent++;const mime=Buffer.from(JSON.parse(String(init?.body)).raw,'base64url').toString();assert.match(mime,/To: verified@example.test/);assert.doesNotMatch(mime,/untrusted@example.test/);return Response.json({id:'gmail-confirmed'});});
 await runOrganizationStatusEmail(env);await runOrganizationStatusEmail(env);assert.equal(sent,1);assert.equal(db.sqlite.prepare("SELECT email_status FROM organization_status_notifications WHERE user_id='website-member'").get()!.email_status,'sent');
 await saveOrganizationMember(env.DB,'org-1',owner,{...member,role:'administrator'},new Date().toISOString());db.sqlite.exec("INSERT INTO notification_preferences(user_id,organization_status_email) VALUES('website-member',0)");await runOrganizationStatusEmail(env);assert.equal(sent,1);assert.equal(db.sqlite.prepare("SELECT email_status FROM organization_status_notifications WHERE user_id='website-member' ORDER BY rowid DESC LIMIT 1").get()!.email_status,'skipped');
});
test('ambiguous mail submissions are never automatically retried',async t=>{
 const {db,env}=fixture(t);await addMember(env);await sender(env);let attempts=0;t.mock.method(globalThis,'fetch',async(input:unknown)=>{if(String(input)==='https://oauth2.googleapis.com/token')return Response.json({access_token:'access'});attempts++;throw new Error('Network lost');});await runOrganizationStatusEmail(env);await runOrganizationStatusEmail(env);assert.equal(attempts,1);assert.equal(db.sqlite.prepare("SELECT email_status FROM organization_status_notifications WHERE user_id='website-member'").get()!.email_status,'uncertain');
});
test('changes made while opted out stay suppressed after notifications are re-enabled',async t=>{
 const {db,env}=fixture(t);db.sqlite.exec("INSERT INTO notification_preferences(user_id,organization_status_email,organization_status_push) VALUES('website-member',0,0)");await addMember(env);db.sqlite.exec("UPDATE notification_preferences SET organization_status_email=1,organization_status_push=1 WHERE user_id='website-member'");const row=db.sqlite.prepare("SELECT email_status,push_status FROM organization_status_notifications WHERE user_id='website-member'").get()!;assert.equal(row.email_status,'skipped');assert.equal(row.push_status,'skipped');
});
