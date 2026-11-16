import test from 'node:test';
import assert from 'node:assert/strict';
import { FullSchemaDb } from './helpers/fullSchemaDb';
import { presentationRoutes } from '../src/eventPresentations';
import { runPresentationOperation } from '../src/presentationMcp';
import { runPresentationHostEmail } from '../src/presentationHostNotifications';
import { runRetention } from '../src/retention';

function fixture(){
 const db=new FullSchemaDb(),sent:any[]=[];
 db.sql.exec(`INSERT INTO organizations(id,name,slug) VALUES('host-org','Hosts','hosts'),('team','Team','team'),('other','Other','other');
  INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES
   ('host-org','owner','owner','active'),('host-org','organizer','administrator','active'),('host-org','member','member','active'),
   ('host-org','inactive','administrator','inactive'),('team','applicant','owner','active'),('other','outsider','owner','active');
  INSERT INTO notification_preferences(user_id,email) VALUES('owner','owner@example.test'),('organizer','organizer@example.test'),('member','member@example.test');
  INSERT INTO events(id,ingest_key,slug,title,host_org_id,starts_at) VALUES('event','event','demo-day','Demo Day','host-org','2099-01-01');
  INSERT INTO event_presentation_forms(event_id,enabled) VALUES('event',1);`);
 const env={DB:db.asD1(),PUBLIC_PORTAL_BASE_URL:'https://lifetech.fyi',SUPPORT_EMAIL:{send:async(message:any)=>{sent.push(message)}}};
 const app=presentationRoutes<typeof env>(async(_env,req)=>({id:req.headers.get('Authorization')||'applicant'}));
 app.onError((error,c)=>c.json({message:error.message},(error as {status?:number}).status as 403||500));
 const submit=(id=crypto.randomUUID(),user='applicant')=>app.request(`/event/presentations/${id}`,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:user},body:JSON.stringify({organization_id:'team',title:'<script>Demo</script>',summary:'A private summary',presenters:[{userId:'applicant'}]})},env);
 const guest=()=>app.request('/event/presentations/apply',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({contact_name:'Guest',email:'guest@example.test',teammate_email:'teammate@example.test',organization_name:'Guest Team',title:'Guest demo',summary:'Guest proposal'}).toString()},env);
 const rows=()=>db.sql.prepare('SELECT * FROM presentation_host_notifications ORDER BY id').all() as any[];
 return {db,env,sent,submit,guest,rows};
}

test('new signed-in submissions durably notify each active host manager once; rejected saves and PUT retries do not',async()=>{
 const f=fixture();try{
  assert.equal((await f.submit(crypto.randomUUID(),'outsider')).status,403);assert.equal(f.rows().length,0);
  const id=crypto.randomUUID();assert.equal((await f.submit(id)).status,200);
  assert.deepEqual(f.rows().map(row=>row.user_id).sort(),['organizer','owner']);
  assert.equal((await f.submit(id)).status,200);assert.equal(f.rows().length,2);
  await Promise.all([runPresentationHostEmail(f.env),runPresentationHostEmail(f.env)]);
  assert.deepEqual(f.sent.map(mail=>mail.to).sort(),['organizer@example.test','owner@example.test']);
  for(const mail of f.sent){assert.match(mail.subject,/New presentation submission: Demo Day/);assert.match(mail.text,/Submitted: \d{4}-.*\(UTC\)/);assert.match(mail.text,/Team submitted/);assert.match(mail.text,/https:\/\/lifetech.fyi\/events\/demo-day\?tab=submissions#submissions/);assert.match(mail.html,/&lt;script&gt;Demo/);assert.doesNotMatch(mail.html,/<script>/)}
  assert.ok(f.rows().every(row=>row.status==='accepted'));
  await runPresentationHostEmail(f.env);assert.equal(f.sent.length,2);
  assert.equal((await f.submit()).status,200);await runPresentationHostEmail(f.env);assert.equal(f.sent.length,4);
 }finally{f.db.sql.close()}
});

test('guest applications alert hosts even if the applicant acknowledgement fails; applicant and teammate receive no host alert',async()=>{
 const f=fixture();try{
  f.env.SUPPORT_EMAIL.send=async message=>{if(message.to==='guest@example.test')throw new Error('timeout');f.sent.push(message)};
  assert.equal((await f.guest()).status,201);assert.equal(f.sent.length,0);
  assert.equal(f.rows().length,2);assert.ok(f.rows().every(row=>row.source==='guest'));
  await runPresentationHostEmail(f.env);assert.equal(f.sent.length,2);
  for(const mail of f.sent){assert.match(mail.text,/Guest Team/);assert.match(mail.text,/Submitted: \d{4}-.*\(UTC\)/);assert.match(mail.text,/Applications without login/);assert.doesNotMatch(mail.text,/guest@example.test|teammate@example.test/)}
  assert.equal((await f.guest()).status,201);assert.equal(f.rows().length,4);
 }finally{f.db.sql.close()}
});

test('MCP preview sends nothing; confirmed application shares the host outbox',async()=>{
 const f=fixture();try{
  const identity={userId:'applicant',scopes:['org:events.read','org:events.write','org:portal.read','org:portal.write']};
  const args={organizationId:'host-org',eventId:'event',teamOrganizationId:'team',submissionId:crypto.randomUUID(),title:'MCP demo',summary:'Details',teammates:[{userId:'applicant'}]};
  const preview=await runPresentationOperation(f.env as Env,identity,'save',args);
  assert.equal(f.rows().length,0);
  await runPresentationOperation(f.env as Env,identity,'save',{...args,previewId:preview.previewId,confirm:true});
  assert.equal(f.rows().length,2);await runPresentationHostEmail(f.env);assert.equal(f.sent.length,2);
 }finally{f.db.sql.close()}
});

test('revoked host access, reassigned events, withdrawn and expired applications cannot leak proposals',async()=>{
 const f=fixture();try{
  await f.submit();f.db.sql.exec("UPDATE organization_memberships SET status='inactive' WHERE user_id='organizer'");
  await runPresentationHostEmail(f.env);assert.equal(f.sent.length,1);assert.equal(f.sent[0].to,'owner@example.test');assert.equal(f.rows().filter(row=>row.status==='skipped').length,1);
  await f.submit();f.db.sql.exec("UPDATE events SET host_org_id='other' WHERE id='event'");await runPresentationHostEmail(f.env);assert.equal(f.sent.length,1);
  f.db.sql.exec("UPDATE events SET host_org_id='host-org' WHERE id='event'");await f.submit();
  f.db.sql.exec("UPDATE event_submissions SET expires_at='2000-01-01'");await runPresentationHostEmail(f.env);assert.equal(f.sent.length,1);
  f.db.sql.exec('DELETE FROM event_submissions');assert.equal(f.rows().length,0);
  await f.guest();f.db.sql.exec('DELETE FROM event_guest_presentations');assert.equal(f.rows().length,0);
 }finally{f.db.sql.close()}
});

test('mail outages retain pending alerts; definite rate rejection retries, unknown outcomes do not',async()=>{
 const f=fixture();try{
  await f.submit();await runPresentationHostEmail({...f.env,SUPPORT_EMAIL:undefined});assert.ok(f.rows().every(row=>row.status==='queued'));
  let attempts=0;
  f.env.SUPPORT_EMAIL.send=async message=>{attempts++;if(message.to==='owner@example.test')throw Object.assign(new Error('secret provider detail'),{code:'E_RATE_LIMIT_EXCEEDED'});throw new Error('ambiguous timeout')};
  await runPresentationHostEmail(f.env);
  assert.equal(f.rows().find(row=>row.user_id==='owner').status,'queued');assert.equal(f.rows().find(row=>row.user_id==='organizer').status,'uncertain');
  assert.doesNotMatch(JSON.stringify(f.rows()),/secret provider detail|ambiguous timeout|example.test/);
  await runPresentationHostEmail(f.env);assert.equal(attempts,2);
  f.db.sql.exec('UPDATE presentation_host_notifications SET next_attempt_at=0');
  f.env.SUPPORT_EMAIL.send=async message=>{f.sent.push(message)};await runPresentationHostEmail(f.env);assert.equal(f.sent.length,1);
  assert.equal(f.sent[0].to,'owner@example.test');
 }finally{f.db.sql.close()}
});

test('missing host email can recover; stale sending leases become uncertain and replicas never send',async()=>{
 const f=fixture();try{
  f.db.sql.exec("DELETE FROM notification_preferences WHERE user_id='organizer'");await f.submit();
  await runPresentationHostEmail({...f.env,ORGANIZATION_REPLICA_SOURCE:'https://primary.example.test'});assert.equal(f.sent.length,0);
  await runPresentationHostEmail(f.env);assert.equal(f.sent.length,1);assert.equal(f.rows().find(row=>row.user_id==='organizer').error_code,'recipient_email_unavailable');
  f.db.sql.exec("INSERT INTO notification_preferences(user_id,email) VALUES('organizer','restored@example.test');UPDATE presentation_host_notifications SET next_attempt_at=0;");
  await runPresentationHostEmail(f.env);assert.equal(f.sent.length,2);assert.equal(f.sent[1].to,'restored@example.test');
  await f.submit();f.db.sql.exec("UPDATE presentation_host_notifications SET status='sending',attempted_at=0 WHERE status='queued'");
  await runPresentationHostEmail(f.env);assert.equal(f.sent.length,2);assert.equal(f.rows().filter(row=>row.status==='uncertain').length,2);
 }finally{f.db.sql.close()}
});

test('outbox is transactional, private, expires with proposals, and cascades on event deletion',async()=>{
 const f=fixture();try{
  assert.ok(f.db.sql.prepare("SELECT 1 FROM change_journal_exclusions WHERE table_name='presentation_host_notifications'").get());
  f.db.sql.exec("BEGIN; INSERT INTO event_submissions(event_id,submission_id,organization_id,submitted_by,title,summary,status,updated_at,expires_at) VALUES('event','rollback','team','applicant','Demo','Details','submitted','2026-11-16','2099-04-01')");assert.equal(f.rows().length,2);f.db.sql.exec('ROLLBACK');assert.equal(f.rows().length,0);
  await f.guest();f.db.sql.exec("UPDATE presentation_host_notifications SET expires_at='2000-01-01'");
  await runRetention(f.env.DB);assert.equal(f.rows().length,0);
  await f.submit();f.db.sql.exec("DELETE FROM events WHERE id='event'");assert.equal(f.rows().length,0);
 }finally{f.db.sql.close()}
});

test('code rollout is safe before the separate outbox migration',async()=>{
 const f=fixture();try{
  f.db.sql.exec('DROP TABLE presentation_host_notifications');
  assert.deepEqual(await runPresentationHostEmail(f.env),{accepted:0,queued:0,uncertain:0,failed:0,skipped:0});
 }finally{f.db.sql.close()}
});
