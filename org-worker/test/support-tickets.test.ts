import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readCurrentSchemaFileSync as readFileSync } from './helpers/currentSchema';
import { acceptSupportMail,supportRoutes,type SupportMail } from '../src/supportTickets';
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0001_contact_pages.sql','0002_org_event_directories.sql','0015_organization_iam.sql','0006_connections_notifications.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 sql.exec(`CREATE TABLE change_journal_exclusions(table_name TEXT PRIMARY KEY,reason TEXT);
 CREATE TABLE group_sites(organization_id TEXT,hostname TEXT,custom_domain_hostname TEXT,custom_domain_status TEXT);
 INSERT INTO organizations(id,name,slug,tags,city) VALUES('life','LifeTech','lifetech','[]','Baltimore'),('other','Other','other','[]','Baltimore');
 INSERT INTO organization_memberships(organization_id,user_id,user_name,role,status) VALUES('life','owner','Owner','owner','active'),('life','admin','Admin','administrator','active'),('life','member','Member','member','active'),('other','outsider','Other owner','owner','active');`);
 sql.exec(readFileSync(new URL('../migrations/0116_support_tickets.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0117_support_controls.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0120_support_mailbox_identity.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0121_organization_service_email.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0129_support_message_html.sql',import.meta.url),'utf8'));
 sql.exec("INSERT INTO support_mailboxes VALUES('life','service@lifetech.fyi')");
 sql.exec("INSERT INTO support_settings VALUES('life',1,'owner','2026-01-01')");
 const db={prepare(query:string){const statement=sql.prepare(query);const bind=(args:any[])=>({bind:(...args:any[])=>bind(args),first:async()=>statement.get(...args)||null,all:async()=>({results:statement.all(...args)}),run:async()=>({meta:{changes:Number(statement.run(...args).changes)}})});return bind([])},async batch(statements:any[]){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}} as unknown as D1Database;
 const mail:SupportMail={from:'sender@example.com',to:'service@lifetech.fyi',subject:'Question',text:'Where can I read the LifeTech bylaws?',messageId:'<one@example.com>',automated:false,attachments:false};
 const app=supportRoutes(async(_env,request)=>({id:request.headers.get('X-Test-User')||'member',email:'verified@example.com',identity_data:{email_verified:true}}));
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
 const reply=await acceptSupportMail(f.db,{...f.mail,subject:'Re: [OP-'+result.ticketId+'] Question',messageId:'<followup>',text:'More help please'},async()=>{});
 assert.equal('ticketId'in reply&&reply.ticketId,result.ticketId);
 const stranger=await acceptSupportMail(f.db,{...f.mail,from:'stranger@example.com',subject:'Re: [OP-'+result.ticketId+'] Question',messageId:'<stranger>',text:'More help please'},async()=>{});
 assert.notEqual('ticketId'in stranger&&stranger.ticketId,result.ticketId);
});
test('private queue, ticket details, FAQ and replies require live admin permission in the correct org',async()=>{
 const f=fixture();const result=await acceptSupportMail(f.db,{...f.mail,text:'Unknown question'},async()=>{});assert.ok('ticketId'in result);const id=result.ticketId!;
 for(const user of ['member','outsider']){
  assert.equal((await f.request(id,'GET',undefined,user)).status,403);
  const settings=await f.request('settings/life','GET',undefined,user);
  assert.equal(settings.status,user==='member'?200:403);
  if(user==='member'){const data=await settings.json();assert.equal(data.canManage,false);assert.deepEqual(data.faqs,[]);assert.deepEqual(data.routes,[]);assert.deepEqual(data.admins,[]);}
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

test('LifeTech admin alias shares its inbox, outbound address and organization permissions',async()=>{
 const f=fixture(),id='ef646755-9443-4c7b-ba4b-a7a29754f666';
 f.sql.prepare("INSERT INTO organizations(id,name,slug,tags,city) VALUES(?,'LifeTech live','lifetech-live','[]','Baltimore')").run(id);
 f.sql.prepare("INSERT INTO organization_memberships(organization_id,user_id,user_name,role,status) VALUES(?,'owner','Owner','owner','active')").run(id);
 f.sql.prepare("INSERT INTO support_settings VALUES(?,1,'owner','2026-01-01')").run(id);
 f.sql.prepare("UPDATE support_mailboxes SET address='old-fixture@example.test' WHERE organization_id='life'").run();
 const {supportMailboxForAddress,supportMailboxForOrganization}=await import('../src/supportMailboxes');
 const mailbox=await supportMailboxForOrganization(f.db,id);assert.equal(mailbox?.address,'admin@lifetech.fyi');assert.equal(mailbox?.senderAddress,'admin@lifetech.fyi');
 for(const address of ['admin@lifetech.fyi','ADMIN@LIFETECH.FYI','service@lifetech.fyi']){
  const resolved=await supportMailboxForAddress(f.db,address);assert.equal(resolved?.organizationId,id);assert.equal(resolved?.address,'admin@lifetech.fyi');
 }
 const result=await acceptSupportMail(f.db,{...f.mail,to:'admin@lifetech.fyi',text:'Invitation reply for staff review',messageId:'<admin-alias-test@example.test>'},async()=>{throw Error('No automatic answer expected')});
 assert.ok('ticketId' in result);const ticket=f.sql.prepare('SELECT * FROM support_tickets WHERE id=?').get(result.ticketId!);assert.equal(ticket?.organization_id,id);
 assert.equal((await f.request(''+result.ticketId,'GET',undefined,'outsider')).status,403);
 const settings=await (await f.request('settings/'+id)).json() as {activation:{mailboxAddress:string;enabled:boolean}};assert.equal(settings.activation.mailboxAddress,'admin@lifetech.fyi');assert.equal(settings.activation.enabled,true);
});

test('received replies join sent mail by Message-ID or unique reply subject and stay organization scoped',async()=>{
 const f=fixture();const created=await f.request('compose/life/send','POST',{to:'sender@example.com',subject:'Staff invitation',body:'Original sent message',requestId:'136a8b46-df1e-43da-bbfb-a041d423c111'});const {ticketId}=await created.json() as {ticketId:string};
 f.sql.prepare('UPDATE support_messages SET message_id=? WHERE ticket_id=?').run('<outbound@lifetech.fyi>',ticketId);
 const first=await acceptSupportMail(f.db,{...f.mail,subject:'Re: Staff invitation',text:'Reply with reference',inReplyTo:'<outbound@lifetech.fyi>',messageId:'<reply-one@example.com>'},async()=>{throw Error('Must not auto-answer a thread')});assert.equal('ticketId' in first&&first.ticketId,ticketId);
 const second=await acceptSupportMail(f.db,{...f.mail,subject:'Re: Staff invitation',text:'Reply without reference',messageId:'<reply-two@example.com>'},async()=>{});assert.equal('ticketId' in second&&second.ticketId,ticketId);
 const other=await acceptSupportMail(f.db,{...f.mail,from:'someoneelse@example.com',subject:'Re: Staff invitation',text:'Unrelated sender',inReplyTo:'<outbound@lifetech.fyi>',messageId:'<other@example.com>'},async()=>{});assert.notEqual('ticketId' in other&&other.ticketId,ticketId);
 const detail=await (await f.request(ticketId)).json() as {messages:{direction:string}[]};assert.deepEqual(detail.messages.map(m=>m.direction),['outbound','inbound','inbound']);
});
test('all retained conversations and messages are paginated without bypassing access checks',async()=>{
 const f=fixture();
 for(let i=0;i<102;i++)f.sql.prepare("INSERT INTO support_tickets(id,organization_id,sender_email,subject,category,status,created_at,updated_at,expires_at) VALUES(?,'life','sender@example.com',?,'general','answered','2026-01-01','2026-01-01',?)").run('page-'+String(i).padStart(3,'0'),'Mail '+i,Date.now()+86400000);
 let page=await (await f.request('')).json() as {tickets:{id:string}[];nextOffset:number|null};assert.equal(page.tickets.length,100);assert.equal(page.nextOffset,100);
 const next=await (await f.request('?offset=100')).json() as {tickets:{id:string}[];nextOffset:number|null};assert.equal(next.tickets.length,2);assert.equal(next.nextOffset,null);
 for(let i=0;i<205;i++)f.sql.prepare("INSERT INTO support_messages(id,ticket_id,direction,body,delivery,created_at) VALUES(?,'page-000',?,?,'received','2026-01-01')").run('message-'+i,i%2?'outbound':'inbound','Message '+i);
 const latest=await (await f.request('page-000')).json() as {messages:{body:string}[];nextBefore:number};assert.equal(latest.messages.length,200);assert.equal(latest.messages[0].body,'Message 5');
 const older=await (await f.request('page-000?before='+latest.nextBefore)).json() as {messages:{body:string}[];nextBefore:null};assert.equal(older.messages.length,5);assert.equal(older.messages[0].body,'Message 0');assert.equal(older.nextBefore,null);
 assert.equal((await f.request('page-000?before='+latest.nextBefore,'GET',undefined,'outsider')).status,403);
});

test('backdated records display chronologically and foreign message cursors are rejected',async()=>{
 const f=fixture();await acceptSupportMail(f.db,f.mail,async()=>{});
 const ticket=f.sql.prepare('SELECT id FROM support_tickets LIMIT 1').get()!.id;
 f.sql.prepare("INSERT INTO support_messages(id,ticket_id,direction,body,delivery,created_at) VALUES('backdated',?,'outbound','Earlier sent mail','sent','2020-01-01T00:00:00Z')").run(ticket);
 const data=await (await f.request(String(ticket))).json() as {messages:{body:string}[]};assert.equal(data.messages[0].body,'Earlier sent mail');
 assert.equal((await f.request(String(ticket)+'?before=999999')).status,400);
});

test('inbound HTML and sent previews retain sanitized formatting in private correspondence',async()=>{
 const f=fixture();const result=await acceptSupportMail(f.db,{...f.mail,subject:'Formatted preview',text:'Plain fallback',html:'<h1 style="color:#155e59">Anchor preview</h1><script>bad()</script>'},async()=>{});
 const inbound=f.sql.prepare("SELECT body,body_html FROM support_messages WHERE ticket_id=? AND direction='inbound'").get('ticketId' in result?result.ticketId:'')!;assert.equal(inbound.body,'Plain fallback');assert.match(String(inbound.body_html),/color:#155e59/);assert.doesNotMatch(String(inbound.body_html),/script/);
 await f.request('compose/life/send','POST',{to:'person@example.test',subject:'Formatted outbound',body:'Hello team',requestId:'136a8b46-df1e-43da-bbfb-a041d423c212'});
 const outgoing=f.sql.prepare("SELECT body_html FROM support_messages WHERE id='136a8b46-df1e-43da-bbfb-a041d423c212'").get()!;assert.match(String(outgoing.body_html),/Hello team/);assert.match(String(outgoing.body_html),/<table/);
 assert.equal((await f.request(''+('ticketId' in result?result.ticketId:''),'GET',undefined,'outsider')).status,403);
});
