import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readCurrentSchemaFileSync as readFileSync } from './helpers/currentSchema';
import { acceptSupportMail,supportRoutes,type SupportMail } from '../src/supportTickets';
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0001_contact_pages.sql','0002_org_event_directories.sql','0015_organization_iam.sql','0006_connections_notifications.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 sql.exec(`CREATE TABLE change_journal_exclusions(table_name TEXT PRIMARY KEY,reason TEXT);
 INSERT INTO organizations(id,name,slug,tags,city) VALUES('life','LifeTech','lifetech','[]','Baltimore'),('other','Other','other','[]','Baltimore');
 INSERT INTO organization_memberships(organization_id,user_id,user_name,role,status) VALUES('life','owner','Owner','owner','active'),('life','admin','Admin','administrator','active'),('life','member','Member','member','active'),('other','outsider','Other owner','owner','active');`);
 sql.exec(readFileSync(new URL('../migrations/0116_support_tickets.sql',import.meta.url),'utf8'));
 const db={prepare(query:string){const statement=sql.prepare(query);const bind=(args:any[])=>({bind:(...args:any[])=>bind(args),first:async()=>statement.get(...args)||null,all:async()=>({results:statement.all(...args)}),run:async()=>({meta:{changes:Number(statement.run(...args).changes)}})});return bind([])},async batch(statements:any[]){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}} as unknown as D1Database;
 const mail:SupportMail={from:'sender@example.com',to:'service@lifetech.fyi',subject:'Question',text:'Where can I read the LifeTech bylaws?',messageId:'<one@example.com>',automated:false,attachments:false};
 const app=supportRoutes(async(_env,request)=>({id:request.headers.get('X-Test-User')||'member'}));
 const request=(path:string,method='GET',body?:unknown,user='owner',send=async()=>{})=>app.request('/'+path,{method,headers:{'X-Test-User':user,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined},{DB:db,SUPPORT_EMAIL:{send}} as unknown as Env);
 return {sql,db,mail,request};
}
test('known FAQ answers once, preserves messages, and does not notify admins',async()=>{
 const f=fixture();let sends=0;const first=await acceptSupportMail(f.db,f.mail,async text=>{sends++;assert.match(text,/lifetech.fyi\/governance/)});
 assert.equal('answered'in first&&first.answered,true);assert.equal(sends,1);
 await acceptSupportMail(f.db,f.mail,async()=>{sends++});assert.equal(sends,1);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM support_tickets').get()?.n,1);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM support_messages').get()?.n,2);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM user_notifications').get()?.n,0);
});
test('additional questions, attachments and automated mail escalate without guessed answers',async()=>{
 for(const patch of [{text:'Where can I read the LifeTech bylaws? Also can you prescribe medication?'},{attachments:true},{automated:true}]){
  const f=fixture();const result=await acceptSupportMail(f.db,{...f.mail,...patch},async()=>{throw Error('Must not auto-answer')});assert.equal('answered'in result&&result.answered,false);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM user_notifications').get()?.n,2);
 }
});
test('configured admin is notified; revoked routing falls back to current admins',async()=>{
 const f=fixture();f.sql.exec("INSERT INTO support_routes VALUES('life','technical','admin')");
 await acceptSupportMail(f.db,{...f.mail,text:'I cannot login'},async()=>{});
 assert.deepEqual(f.sql.prepare('SELECT user_id FROM user_notifications').all().map(r=>r.user_id),['admin']);
 f.sql.exec("UPDATE organization_memberships SET status='inactive' WHERE user_id='admin'");
 await acceptSupportMail(f.db,{...f.mail,messageId:'<two>',text:'Login still broken'},async()=>{});
 assert.equal(f.sql.prepare("SELECT count(*) AS n FROM user_notifications WHERE user_id='owner'").get()?.n,1);
});
test('failed automatic delivery stays open and alerts admins; replies reopen the same sender ticket',async()=>{
 const f=fixture();const result=await acceptSupportMail(f.db,f.mail,async()=>{throw Error('DMARC or delivery failure')});
 assert.equal(f.sql.prepare('SELECT status FROM support_tickets').get()?.status,'open');
 assert.equal(f.sql.prepare("SELECT delivery FROM support_messages WHERE direction='outbound'").get()?.delivery,'uncertain');
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM user_notifications').get()?.n,2);
 assert.ok('ticketId'in result);
 const reply=await acceptSupportMail(f.db,{...f.mail,subject:'Re: [LT-'+result.ticketId+'] Question',messageId:'<followup>',text:'More help please'},async()=>{});
 assert.equal('ticketId'in reply&&reply.ticketId,result.ticketId);
 const stranger=await acceptSupportMail(f.db,{...f.mail,from:'stranger@example.com',subject:'Re: [LT-'+result.ticketId+'] Question',messageId:'<stranger>',text:'More help please'},async()=>{});
 assert.notEqual('ticketId'in stranger&&stranger.ticketId,result.ticketId);
});
test('private queue, ticket details, FAQ and replies require live admin permission in the correct org',async()=>{
 const f=fixture();const result=await acceptSupportMail(f.db,{...f.mail,text:'Unknown question'},async()=>{});assert.ok('ticketId'in result);const id=result.ticketId!;
 for(const user of ['member','outsider']){
  assert.equal((await f.request(id,'GET',undefined,user)).status,403);
  assert.equal((await f.request('settings/life','GET',undefined,user)).status,403);
  assert.equal((await f.request(id+'/reply','POST',{body:'Unauthorized',requestId:crypto.randomUUID()},user)).status,403);
  assert.equal((await f.request(id,'DELETE',undefined,user)).status,403);
  assert.deepEqual((await(await f.request('','GET',undefined,user)).json()).tickets,[]);
 }
 let sent=0;assert.equal((await f.request(id+'/reply','POST',{body:'A reviewed answer',requestId:crypto.randomUUID()},'owner',async()=>{sent++})).status,200);assert.equal(sent,1);
 assert.equal(f.sql.prepare('SELECT status FROM support_tickets').get()?.status,'answered');
 assert.equal((await f.request(id,'DELETE')).status,200);
 for(const table of ['support_tickets','support_messages','user_notifications'])assert.equal(f.sql.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n,0);
});
test('FAQ and routing changes cannot affect another organization or assign non-admins',async()=>{
 const f=fixture();
 assert.equal((await f.request('settings/life/route','PUT',{category:'general',assigned_user_id:'member'})).status,400);
 assert.equal((await f.request('settings/life/faq','PUT',{id:'lifetech-bylaws',question:'A new question?',answer:'A reviewed answer',source_url:'https://lifetech.fyi',enabled:true},'outsider')).status,403);
 assert.equal((await f.request('settings/life/faq','PUT',{question:'A new question?',answer:'A reviewed answer',source_url:'https://lifetech.fyi',enabled:true})).status,200);
});
