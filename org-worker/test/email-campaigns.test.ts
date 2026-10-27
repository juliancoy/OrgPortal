import { addEmailSubscriber, saveEmailDraft, readEmailDraft, readEmailWorkspace } from '../src/emailWorkspaceMcp';
import { contactUnsubscribeToken } from '../src/emailContactPreferences';
import { prepareEmailContactLink } from '../src/emailContactMcp';
import {identityProfile} from './helpers/identityProfile';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import test, { type TestContext } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { app } from '../src/index';
import { runEmailDelivery } from '../src/emailDelivery';
import { finishGoogleConnection, startGoogleConnection } from '../src/emailGoogle';
import { emailFromAddress, decryptSecret, encryptSecret, subscriptionStatement, unsubscribeUrl, type EmailCampaign } from '../src/emailShared';
import { campaignMime, renderCampaign } from '../src/emailTemplate';

class Statement {
  constructor(private statement: StatementSync, private params: unknown[] = []) {}
  bind(...params: unknown[]) { return new Statement(this.statement, params); }
  async first() { return this.statement.get(...this.params) || null; }
  async all() { return { results: this.statement.all(...this.params) }; }
  runSync() { return this.statement.run(...this.params); }
  async run() { return this.runSync(); }
}
function setup(t: TestContext) {
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close());
  database.exec('PRAGMA foreign_keys = ON');
  const directory = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(directory).filter((file) => file.endsWith('.sql')).sort()) database.exec(readFileSync(new URL(file, directory), 'utf8'));
  database.exec(`INSERT INTO organizations (id,name,slug) VALUES ('org-1','Code Collective','code-collective'), ('org-2','Another group','other');
    INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES('org-1','admin','administrator','active'),('org-2','other-admin','owner','active');
    INSERT INTO events (id,ingest_key,title,slug,host_org_id,starts_at,image_url)
      VALUES ('event-1','event-1','Community meetup','meetup','org-1','2026-12-01T23:00:00Z','https://images.test/meetup.jpg');`);
  const env = { DB: { prepare: (sql: string) => new Statement(database.prepare(sql)), batch: async (statements: Statement[]) => {
    database.exec('BEGIN');
    try { const results = statements.map((statement) => statement.runSync()); database.exec('COMMIT'); return results; }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  } }, PIDP_BASE_URL: 'https://identity.test', PUBLIC_PORTAL_BASE_URL: 'https://portal.test/p',
    EMAIL_GOOGLE_CLIENT_ID: 'client-id', EMAIL_GOOGLE_CLIENT_SECRET: 'test-client-secret', EMAIL_GOOGLE_REDIRECT_URI: 'https://portal.test/api/org/api/email/google/callback',
    EMAIL_ALLOWED_SENDERS: 'julian@codecollective.us', EMAIL_TOKEN_ENCRYPTION_KEY: btoa('x'.repeat(32)), EMAIL_UNSUBSCRIBE_SECRET: 'test-unsubscribe-secret-with-32-characters',
    EMAIL_CONTACT_UNSUBSCRIBE_KEY: btoa('c'.repeat(32)), EMAIL_POSTAL_ADDRESS: 'Test mailing address', EMAIL_SENDING_ENABLED: 'true', EMAIL_DAILY_LIMIT: '250',
  } as unknown as Env;
  const request = (path: string, method = 'GET', body?: unknown, user = 'admin') => app.request(`https://portal.test/api/email${path}`, {
    method, headers: user ? { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  }, env);
  return { database, env, request };
}
function mockIdentity(url: string, options?: RequestInit) {
  if (!url.startsWith('https://identity.test/')) return null;
  const user = new Headers(options?.headers).get('Authorization')?.replace('Bearer ', '');
  return Response.json(identityProfile({ id: user, email: user === 'admin' ? 'julian@codecollective.us' : `${user}@example.test`, full_name: 'Julian', is_admin: user === 'admin' || user === 'other-admin' }));
}
function network(t: TestContext, gmail?: (options: RequestInit) => Promise<Response>) {
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, options?: RequestInit) => {
    const url = String(input);
    const identity = mockIdentity(url, options);
    if (identity) return identity;
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'test-access' });
    if (url.endsWith('/messages/send') && gmail) return gmail(options!);
    throw new Error(`Unexpected network request: ${url}`);
  });
}
async function connect(env: Env) {
  await env.DB.prepare('INSERT INTO email_senders (owner_user_id,email,refresh_token_ciphertext,connected_at) VALUES (?, ?, ?, ?)')
    .bind('admin', 'julian@codecollective.us', await encryptSecret(env, 'test-refresh', 'sender:admin:julian@codecollective.us'), Date.now()).run();
}
async function subscribe(env: Env, id = 'alice', type: 'event' | 'organization' = 'event', topic = 'event-1', subscribed = true) {
  await subscriptionStatement(env.DB, { id, email: `${id}@example.test`, full_name: `${id} Person` }, type, topic, subscribed).run();
}
function recordSelfTest(database: DatabaseSync, campaignId: string) {
  database.prepare(`INSERT INTO email_deliveries (id,campaign_id,sender_user_id,email,name,kind,status)
    VALUES (? ,?,'admin','julian@codecollective.us','Julian','test','sent')`).run(crypto.randomUUID(),campaignId);
}
const payload = { event_id: 'event-1', audience: 'event', subject: 'Hello {{first_name}}', body: 'Join {{event_title}}.' };

test('MCP contact links require group organizer scopes and opt out only their exact recipient', async t => {
  const { env, request, database } = setup(t);
  const scopes = ['org:portal.read', 'org:portal.write'];
  await assert.rejects(prepareEmailContactLink(env, {userId:'admin',scopes:[]}, {organizationId:'org-1',email:'personal@example.test'}));
  await assert.rejects(prepareEmailContactLink(env, {userId:'other-admin',scopes}, {organizationId:'org-1',email:'personal@example.test'}));
  const link = await prepareEmailContactLink(env, {userId:'admin',scopes}, {organizationId:'org-1',email:' PERSONAL@example.test '});
  assert.equal(link.email, 'personal@example.test');
  assert.equal(link.unsubscribed, false);
  assert.equal(link.sent, false);
  assert.equal(database.prepare('SELECT count(*) AS n FROM email_subscriptions').get()!.n, 0);
  const token = new URL(link.unsubscribeUrl).searchParams.get('token')!;
  assert.equal((await request('/contact-unsubscribe?token='+encodeURIComponent(token),'GET',undefined,'')).status, 200);
  assert.equal(database.prepare('SELECT count(*) AS n FROM email_contact_suppressions').get()!.n, 0);
  const result = await app.request('https://portal.test/api/email/contact-unsubscribe', {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token})},env);
  assert.equal(result.status, 200);
  assert.equal(database.prepare('SELECT email FROM email_contact_suppressions').get()!.email, 'personal@example.test');
  assert.equal((await prepareEmailContactLink(env, {userId:'admin',scopes}, {organizationId:'org-1',email:'personal@example.test'})).unsubscribed, true);
});

test('mailing lists are group-scoped, no global-admin bypass, and consent never follows membership', async t => {
  const {env,request,database}=setup(t);network(t);
  database.exec(`INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES('org-1','alice','member','active')`);
  await subscribe(env,'alice','organization','org-1');await subscribe(env,'bob','organization','org-2');
  for(const user of ['','alice','other-admin']) {
    const res=await request('/groups/org-1/subscribers','GET',undefined,user);
    assert.equal(res.status,user?403:401);assert.doesNotMatch(await res.text(),/alice@example|bob@example/);
  }
  database.exec("DELETE FROM organization_memberships WHERE user_id='admin'");
  assert.equal((await request('/groups/org-1/subscribers')).status,403);
  database.exec("INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES('org-1','admin','owner','active')");
  const list=await (await request('/groups/org-1/subscribers')).json();
  assert.equal(list.items.length,1);assert.equal(list.items[0].email,'alice@example.test');assert.equal(list.exports_enabled,false);
  assert.equal((await request('/groups/org-1/export')).status,403);
  assert.equal((await request('/groups/org-2/events')).status,403);
  assert.equal((await request('/audience/event-1','GET',undefined,'other-admin')).status,403);
  assert.equal((await request('/groups/org-1/subscription','GET',undefined,'new-member')).status,200);
  assert.equal(database.prepare("SELECT count(*) n FROM email_subscriptions WHERE user_id='new-member'").get()!.n,0);
  assert.equal((await request('/groups/org-1/subscription','PUT',{subscribed:true},'new-member')).status,200);
  const row=database.prepare("SELECT * FROM email_subscriptions WHERE user_id='new-member'").get()!;
  assert.equal(row.consent_source,'group-email-preferences');assert.ok(Number(row.consented_at)>0);
  assert.equal(database.prepare("SELECT count(*) n FROM organization_memberships WHERE user_id='new-member'").get()!.n,0);
  assert.equal((await request('/subscriptions/'+row.id,'PUT',{subscribed:false},'alice')).status,404);
  assert.equal((await request('/groups/org-1/subscribers/'+row.id+'/unsubscribe','POST')).status,200);
  assert.equal(database.prepare('SELECT status FROM email_subscriptions WHERE id=?').get(row.id)!.status,'unsubscribed');
  const journal=database.prepare("SELECT after_json FROM change_journal WHERE table_name='email_subscriptions' ORDER BY sequence DESC LIMIT 1").get()!;
  assert.ok(JSON.parse(String(journal.after_json)).unsubscribed_at);
  assert.equal((await request('/groups/org-1/subscription','PUT',{subscribed:true},'new-member')).status,200);
});

test('segments and exports enforce group consent and audit only minimal metadata',async t=>{
  const {env,request,database}=setup(t);network(t);
  await subscribe(env,'alice','organization','org-1');await subscribe(env,'bob','organization','org-2');
  const alice=database.prepare("SELECT id FROM email_subscriptions WHERE user_id='alice'").get()!,bob=database.prepare("SELECT id FROM email_subscriptions WHERE user_id='bob'").get()!;
  assert.equal((await request('/groups/org-1/segments','POST',{name:'Other group',subscription_ids:[bob.id]})).status,400);
  const saved=await request('/groups/org-1/segments','POST',{name:'Volunteers',subscription_ids:[alice.id]});assert.equal(saved.status,201);
  const segment=await saved.json();
  assert.equal((await request('/groups/org-1/segments/'+segment.id,'DELETE',undefined,'other-admin')).status,403);
  assert.equal((await request('/groups/org-2/segments/'+segment.id,'DELETE',undefined,'other-admin')).status,404);
  assert.equal((await (await request('/groups/org-1/segments')).json()).length,1);
  env.EMAIL_EXPORTS_ENABLED='true';
  database.prepare("UPDATE email_subscriptions SET name='=DANGEROUS()' WHERE id=?").run(alice.id);
  const exported=await request('/groups/org-1/export');assert.equal(exported.status,200);
  const csv=await exported.text();assert.match(csv,/'=DANGEROUS/);assert.match(csv,/alice@example/);assert.doesNotMatch(csv,/bob@example/);
  const audit=database.prepare('SELECT * FROM email_mailing_audit').all();assert.ok(audit.some(row=>row.action==='subscribers.export'));
  assert.doesNotMatch(JSON.stringify(audit),/@example|Volunteers|DANGEROUS/);
});

test('general group announcements require fresh one-use preview and revoked organizers cannot send queued mail',async t=>{
  const {env,request,database}=setup(t);let sends=0;network(t,async()=>{sends++;return Response.json({id:'sent'})});await connect(env);
  await subscribe(env,'alice','organization','org-1');await subscribe(env,'bob','organization','org-2');
  const create=await request('/campaigns','POST',{organization_id:'org-1',audience:'organization',subject:'Group update',body:'Hello {{first_name}} from {{organization}}'});
  assert.equal(create.status,201);const draft=await create.json();recordSelfTest(database,draft.id);assert.equal(draft.recipient_count,1);assert.match(draft.preview.html,/Visit group/);assert.doesNotMatch(draft.preview.html,/Date to be announced/);
  assert.equal((await request('/campaigns','POST',{...payload,organization_id:'org-2'})).status,403);
  assert.equal((await request('/campaigns/'+draft.id+'/send','POST',{fingerprint:draft.fingerprint})).status,400);
  let preview=await (await request('/campaigns/'+draft.id)).json();
  database.prepare('UPDATE email_campaign_previews SET expires_at=0 WHERE id=?').run(preview.preview_id);
  assert.equal((await request('/campaigns/'+draft.id+'/send','POST',{fingerprint:preview.fingerprint,preview_id:preview.preview_id,confirm:true})).status,409);
  preview=await (await request('/campaigns/'+draft.id)).json();
  const confirmation={fingerprint:preview.fingerprint,preview_id:preview.preview_id,confirm:true};
  const results=await Promise.all([request('/campaigns/'+draft.id+'/send','POST',confirmation),request('/campaigns/'+draft.id+'/send','POST',confirmation)]);
  assert.deepEqual(results.map(res=>res.status).sort(),[200,409]);
  database.exec("UPDATE organization_memberships SET role='member' WHERE user_id='admin'");
  assert.equal((await request('/campaigns/'+draft.id)).status,403);
  await runEmailDelivery(env);assert.equal(sends,0);assert.equal(database.prepare('SELECT status FROM email_campaigns').get()!.status,'paused');
  assert.equal(database.prepare("SELECT status FROM email_deliveries WHERE kind='campaign'").get()!.status,'skipped');
});

test('Google sender setup starts only on the configured callback host and rechecks group access',async t=>{
  const {env,request,database}=setup(t);network(t);
  const sender=await (await request('/sender')).json();assert.equal(sender.connection_origin,'https://portal.test');
  const bad=await app.request('https://medtech.social/api/email/google/connect',{method:'POST',headers:{Authorization:'Bearer admin','Content-Type':'application/json'},body:JSON.stringify({organization_id:'org-1'})},env);
  assert.equal(bad.status,409);assert.equal(database.prepare('SELECT count(*) n FROM email_oauth_states').get()!.n,0);
  assert.equal((await request('/google/connect','POST',{organization_id:'org-2'})).status,403);
  const result=await request('/google/connect','POST',{organization_id:'org-1'});assert.equal(result.status,200);
  const response=await result.json(),state=new URL(response.url).searchParams.get('state')!;
  assert.equal(database.prepare('SELECT organization_id FROM email_oauth_states').get()!.organization_id,'org-1');
  const cookie=result.headers.get('set-cookie')!.match(/__Host-portal-email-oauth=([^;]+)/)![1];
  database.exec("UPDATE organization_memberships SET role='member' WHERE user_id='admin'");
  await assert.rejects(()=>finishGoogleConnection(env,state,cookie,'code'),{status:403});
});

test('same email address never transfers subscription ownership to another account',async t=>{
  const {env,database}=setup(t);
  await subscriptionStatement(env.DB,{id:'original',email:'shared@example.test'},'organization','org-1',true).run();
  await subscriptionStatement(env.DB,{id:'different',email:'shared@example.test'},'organization','org-1',false).run();
  const row=database.prepare("SELECT user_id,status FROM email_subscriptions WHERE email='shared@example.test'").get()!;
  assert.equal(row.user_id,'original');assert.equal(row.status,'subscribed');
});

test('sender OAuth binds browser, account, nonce and one-use state; refresh tokens are encrypted', async (t) => {
  const { env, database } = setup(t);
  const user = { id: 'admin', email: 'julian@codecollective.us' };
  const started = await startGoogleConnection(env, user,'org-1');
  const url = new URL(started.url);
  assert.equal(url.searchParams.get('scope'), 'openid email https://www.googleapis.com/auth/gmail.send');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  await assert.rejects(() => startGoogleConnection(env, { id: 'intruder', email: 'other@example.test' }));
  await assert.rejects(() => finishGoogleConnection(env, url.searchParams.get('state')!, 'wrong-browser', 'code'));
  const pair = await generateKeyPair('RS256');
  const publicKey = { ...await exportJWK(pair.publicKey), kid: 'test', alg: 'RS256', use: 'sig' };
  const idToken = await new SignJWT({ email: user.email, email_verified: true, nonce: url.searchParams.get('nonce') })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer('https://accounts.google.com').setAudience('client-id').setSubject('google-user').setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);
  let exchanges = 0;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    if (String(input) === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [publicKey] });
    if (String(input) === 'https://oauth2.googleapis.com/token') { exchanges++; return Response.json({ id_token: idToken, refresh_token: 'actual-refresh-token', scope: 'https://www.googleapis.com/auth/gmail.send' }); }
    throw new Error('Unexpected request');
  });
  assert.equal(await finishGoogleConnection(env, url.searchParams.get('state')!, started.browser, 'code'),'org-1');
  const sender = database.prepare('SELECT * FROM email_senders').get()!;
  assert.equal(sender.email, user.email);
  assert.notEqual(sender.refresh_token_ciphertext, 'actual-refresh-token');
  assert.equal(await decryptSecret(env, String(sender.refresh_token_ciphertext), `sender:admin:${user.email}`), 'actual-refresh-token');
  await assert.rejects(() => decryptSecret(env, String(sender.refresh_token_ciphertext), 'sender:another-owner'));
  await assert.rejects(() => finishGoogleConnection(env, url.searchParams.get('state')!, started.browser, 'code'));
  assert.equal(exchanges, 1);
});

test('registration keeps event consent separate from announcements and cancellation only stops event updates', async (t) => {
  const { env, database } = setup(t);
  network(t);
  const request = (body: unknown, method = 'POST') => app.request('https://portal.test/api/network/events/event-1/attendance', {
    method, headers: { Authorization: 'Bearer alice', 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined,
  }, env);
  assert.equal((await request({ email_updates: true, organization_announcements: false })).status, 200);
  assert.equal(database.prepare("SELECT count(*) AS n FROM email_subscriptions WHERE topic_type = 'organization'").get()!.n, 0);
  await request({ email_updates: true, organization_announcements: true });
  assert.equal(database.prepare('SELECT count(*) AS n FROM email_subscriptions').get()!.n, 2);
  await request({}, 'DELETE');
  assert.equal(database.prepare("SELECT status FROM email_subscriptions WHERE topic_type = 'event'").get()!.status, 'unsubscribed');
  assert.equal(database.prepare("SELECT status FROM email_subscriptions WHERE topic_type = 'organization'").get()!.status, 'subscribed');
});

test('campaigns require admin and sender ownership; selected recipients must have consent in the event organization', async (t) => {
  const { env, request } = setup(t);
  network(t); await connect(env); await subscribe(env); await subscribe(env, 'bob', 'organization', 'org-2');
  assert.equal((await request('/campaigns', 'GET', undefined, '')).status, 401);
  assert.equal((await request('/campaigns', 'GET', undefined, 'alice')).status, 403);
  const created = await request('/campaigns', 'POST', payload);
  assert.equal(created.status, 201);
  const preview = await created.json();
  assert.equal(preview.recipient_count, 1);
  assert.match(preview.preview.html, /Community meetup/);
  assert.equal((await request(`/campaigns/${preview.id}`, 'GET', undefined, 'other-admin')).status, 404);
  assert.equal((await request('/campaigns', 'POST', { ...payload, audience: 'selected', selected_ids: ['other-org-id'] })).status, 400);
  const sender = await (await request('/sender')).json();
  assert.equal(sender.connected, true);
  assert.doesNotMatch(JSON.stringify(sender), /refresh|ciphertext|test-client-secret/);
});

test('unsubscribe links are signed, GET is inert, and changed audiences invalidate an approved preview', async (t) => {
  const { env, request, database } = setup(t);
  network(t); await connect(env); await subscribe(env);
  const draft = await (await request('/campaigns', 'POST', payload)).json();
  recordSelfTest(database,draft.id);
  const preview=await (await request(`/campaigns/${draft.id}`)).json();
  const subscription = database.prepare('SELECT id FROM email_subscriptions').get()!;
  const url = await unsubscribeUrl(env, String(subscription.id));
  const token = new URL(url).searchParams.get('token')!;
  assert.equal((await request(`/unsubscribe?token=${encodeURIComponent(token)}`, 'GET', undefined, '')).status, 200);
  assert.equal(database.prepare('SELECT status FROM email_subscriptions').get()!.status, 'subscribed');
  assert.equal((await request(`/unsubscribe?token=${encodeURIComponent(token)}bad`, 'POST', undefined, '')).status, 400);
  const unsub = await app.request(`https://portal.test/api/email/unsubscribe?token=${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click',
  }, env);
  assert.equal(unsub.status, 200);
  assert.equal(database.prepare('SELECT status FROM email_subscriptions').get()!.status, 'unsubscribed');
  assert.equal((await request(`/campaigns/${preview.id}/send`, 'POST', { fingerprint: preview.fingerprint, preview_id:preview.preview_id,confirm:true })).status, 409);
});

test('outbox deduplicates dispatch, honors pauses and late unsubscribes, and counts tests against the rolling quota', async (t) => {
  const { env, request, database } = setup(t);
  const sent: string[] = [];
  network(t, async (options) => { const data = JSON.parse(String(options.body)); sent.push(Buffer.from(data.raw, 'base64url').toString()); return Response.json({ id: `gmail-${sent.length}` }); });
  await connect(env); await subscribe(env); await subscribe(env, 'bob');
  const draft = await (await request('/campaigns', 'POST', payload)).json();
  recordSelfTest(database,draft.id);
  const preview=await (await request(`/campaigns/${draft.id}`)).json();
  assert.equal((await request(`/campaigns/${preview.id}/send`, 'POST', { fingerprint: preview.fingerprint, preview_id:preview.preview_id,confirm:true })).status, 200);
  assert.equal((await request(`/campaigns/${preview.id}/send`, 'POST', { fingerprint: preview.fingerprint, preview_id:preview.preview_id,confirm:true })).status, 409);
  await request(`/campaigns/${preview.id}/pause`, 'POST');
  await runEmailDelivery(env); assert.equal(sent.length, 0);
  await request(`/campaigns/${preview.id}/test`, 'POST');
  assert.equal((await request(`/campaigns/${preview.id}/test`, 'POST')).status, 409);
  await runEmailDelivery(env); assert.equal(sent.length, 1); assert.match(sent[0], /To: julian@codecollective.us/);
  env.EMAIL_DAILY_LIMIT = '1';
  await request(`/campaigns/${preview.id}/resume`, 'POST');
  await Promise.all([runEmailDelivery(env), runEmailDelivery(env)]); assert.equal(sent.length, 1);
  env.EMAIL_DAILY_LIMIT = '250';
  database.prepare("UPDATE email_subscriptions SET status = 'unsubscribed' WHERE email = 'bob@example.test'").run();
  await Promise.all([runEmailDelivery(env), runEmailDelivery(env)]);
  assert.equal(sent.length, 2); assert.match(sent[1], /To: alice@example.test/); assert.match(sent[1], /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
  await runEmailDelivery(env); assert.equal(sent.length, 2);
  assert.equal(database.prepare("SELECT count(*) AS n FROM email_deliveries WHERE status = 'skipped'").get()!.n, 1);
  assert.equal(database.prepare('SELECT status FROM email_campaigns').get()!.status, 'completed');
});

test('ambiguous sends are never automatically retried; scheduled and disabled campaigns wait', async (t) => {
  const { env, request, database } = setup(t);
  let attempts = 0;
  network(t, async () => { attempts++; throw new Error('Network timeout after submission'); });
  await connect(env); await subscribe(env);
  const draft = await (await request('/campaigns', 'POST', { ...payload, scheduled_at: new Date(Date.now() + 3600_000).toISOString() })).json();
  recordSelfTest(database,draft.id);
  const preview=await (await request(`/campaigns/${draft.id}`)).json();
  assert.equal((await request(`/campaigns/${draft.id}/send`, 'POST', {fingerprint:preview.fingerprint,preview_id:preview.preview_id,confirm:true})).status,200);
  await runEmailDelivery(env); assert.equal(attempts, 0);
  database.prepare('UPDATE email_campaigns SET scheduled_at = 0').run();
  env.EMAIL_SENDING_ENABLED = 'false'; await runEmailDelivery(env); assert.equal(attempts, 0);
  env.EMAIL_SENDING_ENABLED = 'true'; await runEmailDelivery(env); await runEmailDelivery(env);
  assert.equal(attempts, 1);
  assert.equal(database.prepare("SELECT status FROM email_deliveries WHERE kind='campaign'").get()!.status, 'uncertain');
});

test('templates escape personalized HTML and encode Unicode mail with individual recipients', async (t) => {
  const { env, request, database } = setup(t);
  network(t); await connect(env); await subscribe(env);
  const draft = await (await request('/campaigns', 'POST', { ...payload, body: 'Hi {{first_name}}, <script>alert(1)</script>', subject: 'Welcome 👋 {{first_name}}' })).json();
  const campaign = database.prepare('SELECT * FROM email_campaigns WHERE id = ?').get(draft.id) as unknown as EmailCampaign;
  const rendered = renderCampaign(env, campaign, '<img>\r\nBcc:bad@example.test', null);
  assert.doesNotMatch(rendered.html, /<script>/); assert.match(rendered.html, /&lt;script&gt;/);
  const raw = await campaignMime(env, campaign, { id: 'id-1', email: 'alice@example.test', name: 'Álice', kind: 'campaign' }, 'https://portal.test/unsubscribe?token=test');
  assert.match(raw, /Subject: =\?UTF-8\?B\?/); assert.match(raw, /multipart\/alternative/); assert.doesNotMatch(raw, /^Bcc:/m);
  assert.match(raw, /To: alice@example.test/);
});


test('sender setup reports missing configuration without exposing secrets or treating it as an access denial', async t => {
  const { env, request } = setup(t); network(t);
  const ready = await (await request('/sender')).json();
  assert.equal(ready.configured, true);
  assert.deepEqual(ready.setup_issues, []);
  delete env.EMAIL_GOOGLE_CLIENT_ID;
  delete env.EMAIL_POSTAL_ADDRESS;
  env.EMAIL_TOKEN_ENCRYPTION_KEY = 'invalid';
  env.EMAIL_GOOGLE_REDIRECT_URI = 'https://other.test/api/email/google/callback';
  const response = await request('/sender');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.configured, false);
  assert.deepEqual(result.setup_issues, ['Google OAuth client ID', 'Sender token encryption key', 'Matching portal and Google callback hosts']);
  assert.doesNotMatch(JSON.stringify(result), /test-client-secret|test-unsubscribe-secret/);
  assert.equal((await request('/sender', 'GET', undefined, '')).status, 401);
});


test('configured send-as aliases change message headers without changing Google account ownership', async t => {
  const { env, request } = setup(t); network(t);
  env.EMAIL_SENDER_ALIASES = JSON.stringify({ 'julian@codecollective.us': 'events@codecollective.us' });
  const sender = await (await request('/sender')).json();
  assert.equal(sender.email, 'julian@codecollective.us');
  assert.equal(sender.from_email, 'events@codecollective.us');
  assert.equal(emailFromAddress(env, 'other@example.test'), 'other@example.test');
  await connect(env); await subscribe(env);
  const draft = await (await request('/campaigns', 'POST', payload)).json();
  assert.equal(draft.sender_email, 'julian@codecollective.us');
  assert.equal(draft.from_email, 'events@codecollective.us');
  const mime = await campaignMime(env, draft, {email:'alice@example.test',name:'Alice',id:'delivery',kind:'test'},null);
  assert.match(mime, /^From: events@codecollective.us\r\n/);
  assert.match(mime, /Reply-To: events@codecollective.us\r\n/);
  env.EMAIL_SENDER_ALIASES = JSON.stringify({'julian@codecollective.us':'events@example.test\r\nBcc: other@example.test'});
  assert.throws(() => emailFromAddress(env, 'julian@codecollective.us'));
});


test('Google exchange failures expose only actionable error categories and never provider details', async t => {
  const { env } = setup(t);
  for (const code of ['invalid_client', 'invalid_grant', 'redirect_uri_mismatch', 'unauthorized_client', 'access_denied', 'unknown-sensitive-provider-response']) {
    const started = await startGoogleConnection(env, {id:'admin', email:'julian@codecollective.us'}, 'org-1');
    const state = new URL(started.url).searchParams.get('state')!;
    t.mock.method(globalThis, 'fetch', async () => Response.json({error:code,error_description:'private-token-and-provider-details'}, {status:400}));
    await assert.rejects(() => finishGoogleConnection(env,state,started.browser,'code'));
    // Use a separate attempt because exchange states are deliberately one-use.
    const retry = await startGoogleConnection(env, {id:'admin',email:'julian@codecollective.us'},'org-1');
    try { await finishGoogleConnection(env,new URL(retry.url).searchParams.get('state')!,retry.browser,'code'); assert.fail('Expected provider rejection'); }
    catch(error) {
      const detail = await (error as {res:Response}).res.text();
      assert.doesNotMatch(detail,/private-token|provider-details|unknown-sensitive-provider-response/);
      assert.match(detail, code === 'unknown-sensitive-provider-response' ? /HTTP 400/ : new RegExp(code));
    }
    t.mock.restoreAll();
  }
});


test('campaigns require their own Gmail-accepted self-test before send, schedule or resume', async t => {
  const {env,request,database}=setup(t);
  const sent: string[]=[];
  network(t,async options=>{sent.push(Buffer.from(JSON.parse(String(options.body)).raw,'base64url').toString());return Response.json({id:'gmail-test'});});
  await connect(env); await subscribe(env);
  const draft=await (await request('/campaigns','POST',payload)).json();
  const preview=await (await request(`/campaigns/${draft.id}`)).json();
  const confirm={fingerprint:preview.fingerprint,preview_id:preview.preview_id,confirm:true};
  assert.equal(preview.self_test_sent,false);
  assert.equal((await request(`/campaigns/${draft.id}/send`,'POST',confirm)).status,409);
  assert.equal((await request(`/campaigns/${draft.id}/test`,'POST')).status,200);
  assert.equal((await request(`/campaigns/${draft.id}/send`,'POST',confirm)).status,409);
  database.prepare("UPDATE email_deliveries SET status='failed' WHERE kind='test'").run();
  assert.equal((await request(`/campaigns/${draft.id}/send`,'POST',confirm)).status,409);
  database.prepare("UPDATE email_deliveries SET status='queued' WHERE kind='test'").run();
  await runEmailDelivery(env);
  assert.equal(sent.length,1);assert.match(sent[0],/To: julian@codecollective.us/);
  assert.equal((await (await request(`/campaigns/${draft.id}`)).json()).self_test_sent,true);
  assert.equal((await request(`/campaigns/${draft.id}/send`,'POST',confirm)).status,200);
  const next=await (await request('/campaigns','POST',{...payload,scheduled_at:new Date(Date.now()+3600000).toISOString()})).json();
  const nextPreview=await (await request(`/campaigns/${next.id}`)).json();
  assert.equal((await request(`/campaigns/${next.id}/send`,'POST',{fingerprint:nextPreview.fingerprint,preview_id:nextPreview.preview_id,confirm:true})).status,409);
  database.prepare("UPDATE email_campaigns SET status='paused' WHERE id=?").run(next.id);
  assert.equal((await request(`/campaigns/${next.id}/resume`,'POST')).status,409);
  database.prepare("UPDATE email_campaigns SET status='queued' WHERE id=?").run(next.id);
  await runEmailDelivery(env);
  assert.equal(database.prepare('SELECT status FROM email_campaigns WHERE id=?').get(next.id)!.status,'paused');
});


test('OAuth callback failures show a recovery action instead of a raw JSON dead end', async t => {
  const {env}=setup(t);
  for (const failure of ['expired','network','invalid_client']) {
    let query='',cookie='';
    if(failure!=='expired') {
      const started=await startGoogleConnection(env,{id:'admin',email:'julian@codecollective.us'},'org-1');
      query=`?state=${new URL(started.url).searchParams.get('state')}&code=test-code`;
      cookie=`__Host-portal-email-oauth=${started.browser}`;
      t.mock.method(globalThis,'fetch',async()=>{if(failure==='network')throw new Error('private network diagnostics');return Response.json({error:'invalid_client',error_description:'private provider diagnostics'},{status:401});});
    }
    const response=await app.request(`https://portal.test/api/email/google/callback${query}`,{headers:{Cookie:cookie}},env);
    assert.equal(response.status,failure==='network'?503:400);
    assert.match(response.headers.get('content-type')||'',/text\/html/);
    assert.match(response.headers.get('cache-control')||'',/no-store/);
    const html=await response.text();
    assert.match(html,/href="https:\/\/portal.test\/p\/email"/);
    assert.match(html,/Return to Email and reconnect Google/);
    assert.doesNotMatch(html,/private network|private provider|test-code/);
    t.mock.restoreAll();
  }
});


test('contact opt-out is anonymous, group scoped, idempotent, and blocks reimported addresses', async t => {
  const {env,request,database}=setup(t);network(t);await connect(env);
  env.EMAIL_CONTACT_UNSUBSCRIBE_KEY=btoa('k'.repeat(32));
  await subscribe(env,'alice');await subscribe(env,'alice','organization','org-1');await subscribe(env,'alice','organization','org-2');
  const draft=await (await request('/campaigns','POST',payload)).json();
  recordSelfTest(database,draft.id);
  database.prepare("UPDATE email_campaigns SET status='queued' WHERE id=?").run(draft.id);
  database.prepare("UPDATE email_deliveries SET status='queued' WHERE campaign_id=? AND kind='campaign'").run(draft.id);
  const token=await contactUnsubscribeToken(env,{email:'alice@example.test',organizationId:'org-1'});
  assert.doesNotMatch(token,/alice|org-1/);
  const path=`/contact-unsubscribe?token=${encodeURIComponent(token)}`;
  assert.equal((await request(path,'GET',undefined,'')).status,200);
  assert.equal(database.prepare('SELECT count(*) n FROM email_contact_suppressions').get()!.n,0);
  assert.equal((await request(path,'POST',undefined,'')).status,200);
  assert.equal((await request(path,'POST',undefined,'')).status,200);
  assert.equal(database.prepare('SELECT count(*) n FROM email_contact_suppressions').get()!.n,1);
  assert.equal(database.prepare("SELECT status FROM email_subscriptions WHERE topic_id='org-2'").get()!.status,'subscribed');
  assert.equal(database.prepare("SELECT status FROM email_subscriptions WHERE topic_id='org-1'").get()!.status,'unsubscribed');
  assert.equal(database.prepare("SELECT status FROM email_deliveries WHERE campaign_id=? AND kind='campaign'").get(draft.id)!.status,'skipped');
  // An import or old job restoring subscription/queue rows cannot override suppression.
  database.exec("UPDATE email_subscriptions SET status='subscribed'; UPDATE email_deliveries SET status='queued' WHERE kind='campaign'");
  assert.equal((await (await request('/audience/event-1')).json()).event_count,0);
  await runEmailDelivery(env);
  assert.equal(database.prepare("SELECT status FROM email_deliveries WHERE campaign_id=? AND kind='campaign'").get(draft.id)!.status,'skipped');
  assert.equal((await request('/groups/org-1/suppressions','GET',undefined,'alice')).status,403);
  assert.equal((await request('/groups/org-1/suppressions')).status,200);
  assert.equal((await request(`/contact-unsubscribe?token=x${token}`,'POST',undefined,'')).status,400);
});

test('external contacts can opt out without creating an account; only deliberate self opt-in clears suppression',async t=>{
 const {env,request,database}=setup(t);network(t);env.EMAIL_CONTACT_UNSUBSCRIBE_KEY=btoa('k'.repeat(32));
 const link=await (await request('/groups/org-1/unsubscribe-link','POST',{email:'admin@example.test'})).json();
 assert.ok(link.url.includes('/contact-unsubscribe?token='));
 assert.equal((await request('/groups/org-1/unsubscribe-link','POST',{email:'external@example.test'},'alice')).status,403);
 const token=await contactUnsubscribeToken(env,{email:'julian@codecollective.us',organizationId:'org-1'});
 await request(`/contact-unsubscribe?token=${token}`,'POST',undefined,'');
 assert.equal(database.prepare('SELECT count(*) n FROM email_subscriptions').get()!.n,0);
 assert.equal(database.prepare('SELECT count(*) n FROM email_contact_suppressions').get()!.n,1);
 await request('/groups/org-1/subscription','PUT',{subscribed:true});
 assert.equal(database.prepare('SELECT count(*) n FROM email_contact_suppressions').get()!.n,0);
});

test('engagement is signed, unique, private, expiry bounded and attributes one-click opt-outs',async t=>{
  const {env,request,database}=setup(t);let raw='';
  network(t,async options=>{raw=Buffer.from(JSON.parse(String(options.body)).raw,'base64url').toString();return Response.json({id:'gmail-engagement'});});
  await connect(env);await subscribe(env);
  const draft=await(await request('/campaigns','POST',{...payload,body:'RSVP: https://luma.com/example?ref=one&source=email'})).json();
  recordSelfTest(database,draft.id);
  const preview=await(await request(`/campaigns/${draft.id}`)).json();
  await request(`/campaigns/${draft.id}/send`,'POST',{fingerprint:preview.fingerprint,preview_id:preview.preview_id,confirm:true});
  await runEmailDelivery(env);
  const html=Buffer.from(raw.split('Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g,''),'base64').toString();
  const urls=[...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m=>m[1].replace(/&amp;/g,'&'));
  const open=urls.find(u=>u.includes('/engagement/open'))!;
  const click=urls.find(u=>u.includes('/engagement/click')&&new URL(u).searchParams.get('url')?.includes('luma.com'))!;
  const unsub=raw.match(/List-Unsubscribe: <([^>]+)>/)![1];
  assert.ok(open&&click);assert.doesNotMatch(open,/alice|example.test/);
  assert.match(html,/90 days/);assert.equal(database.prepare('SELECT count(*) n FROM email_engagement').get()!.n,1);
  const publicRequest=(url:string,method='GET',headers?:Record<string,string>)=>app.request(url.replace('/api/org/api/','/api/'),{method,headers},env);
  const stats=async()=> (await(await request(`/campaigns/${draft.id}`)).json()).engagement;
  assert.deepEqual(await stats(),{sent:1,tracked:1,opened:0,clicked:0,unsubscribed:0});
  await publicRequest(open,'HEAD');await publicRequest(click,'GET',{'Sec-Purpose':'prefetch'});
  assert.equal((await stats()).opened,0);assert.equal((await stats()).clicked,0);
  const bad=new URL(click);bad.searchParams.set('url','https://attacker.test/');assert.equal((await publicRequest(bad.toString())).status,404);
  const pixel=await publicRequest(open);assert.equal(pixel.status,200);assert.equal(pixel.headers.get('Content-Type'),'image/gif');assert.match(pixel.headers.get('Cache-Control')!,/no-store/);
  await publicRequest(open);
  const redirect=await publicRequest(click);assert.equal(redirect.status,302);assert.equal(redirect.headers.get('Location'),'https://luma.com/example?ref=one&source=email');await publicRequest(click);
  assert.deepEqual(await stats(),{sent:1,tracked:1,opened:1,clicked:1,unsubscribed:0});
  assert.equal((await request(`/campaigns/${draft.id}`,'GET',undefined,'other-admin')).status,404);
  await publicRequest(unsub);assert.equal((await stats()).unsubscribed,0);
  await publicRequest(unsub,'POST',{'Content-Type':'application/x-www-form-urlencoded'});await publicRequest(unsub,'POST');
  assert.equal((await stats()).unsubscribed,1);assert.equal(database.prepare('SELECT count(*) n FROM email_contact_suppressions').get()!.n,1);
  const first=database.prepare('SELECT * FROM email_engagement').get()!;await publicRequest(open);assert.equal(database.prepare('SELECT opened_at FROM email_engagement').get()!.opened_at,first.opened_at);
  database.exec('UPDATE email_engagement SET expires_at=1');
  assert.deepEqual(await stats(),{sent:1,tracked:0,opened:0,clicked:0,unsubscribed:0});
  database.exec('DELETE FROM email_engagement');
  assert.equal((await publicRequest(click)).headers.get('Location'),'https://luma.com/example?ref=one&source=email');
  assert.equal((await publicRequest(unsub,'POST')).status,200);
  assert.equal(database.prepare('SELECT count(*) n FROM email_engagement').get()!.n,0);
});

test('reviewed outreach never subscribes contacts; live opt-outs and bounces block every batch, capped at 50',async t=>{
 const {env,request,database}=setup(t);await connect(env);let calls=0;network(t,async()=>Response.json({id:`receipt-${++calls}`}));
 const recipients=Array.from({length:53},(_,i)=>({email:`person${i}@example.test`,name:`Person ${i}`,source_url:'https://example.test/contact',source_checked_at:new Date().toISOString(),approved:true}));
 const response=await request('/outreach','POST',{organizationId:'org-1',subject:'A reviewed invitation',body:'Join our community.',content:{heading:'Community evening',rsvp_url:'https://example.test/rsvp'},recipients:[...recipients,recipients[0],{...recipients[0],email:'invalid'}]});
 assert.equal(response.status,201,await response.clone().text());const created=await response.json() as {id:string;duplicates:number;invalid:number};assert.equal(created.duplicates,1);assert.equal(created.invalid,1);
 assert.equal(database.prepare('SELECT count(*) n FROM email_subscriptions').get()!.n,0);
 await env.DB.prepare("UPDATE email_deliveries SET dns_status='mx_present' WHERE campaign_id=?").bind(created.id).run();
 await env.DB.prepare("INSERT INTO email_contact_suppressions VALUES('org-1','person51@example.test','recipient-unsubscribe',1,1)").run();
 await env.DB.prepare("INSERT INTO email_bounces VALUES('org-1','person52@example.test','Mailbox gone','notice',1,1)").run();
 let p=await(await request(`/campaigns/${created.id}`)).json() as any;assert.equal(p.recipient_count,51);
 assert.equal((await request(`/campaigns/${created.id}/send`,'POST',{fingerprint:p.fingerprint,preview_id:p.preview_id,confirm:true})).status,409);
 recordSelfTest(database,created.id);p=await(await request(`/campaigns/${created.id}`)).json() as any;
 assert.equal((await request(`/campaigns/${created.id}/send`,'POST',{fingerprint:p.fingerprint,preview_id:p.preview_id,confirm:true})).status,200);
 for(let i=0;i<7;i++)await runEmailDelivery(env);
 assert.equal(calls,50);assert.equal(database.prepare('SELECT status FROM email_campaigns WHERE id=?').get(created.id)!.status,'paused');
 p=await(await request(`/campaigns/${created.id}`)).json() as any;
 assert.equal((await request(`/campaigns/${created.id}/resume`,'POST')).status,409);
 assert.equal((await request(`/campaigns/${created.id}/resume`,'POST',{fingerprint:p.fingerprint,preview_id:p.preview_id,confirm:true})).status,200);
 await runEmailDelivery(env);assert.equal(calls,51);assert.equal(database.prepare('SELECT status FROM email_campaigns WHERE id=?').get(created.id)!.status,'completed');
 assert.equal(database.prepare("SELECT count(*) n FROM email_deliveries WHERE campaign_id=? AND kind='campaign' AND status='skipped'").get(created.id)!.n,2);
});

test('external campaign history is owner-scoped, idempotent, untracked and cannot be resent',async t=>{
 const {env,request,database}=setup(t);await connect(env);network(t);
 const payload={organizationId:'org-1',import_key:'completed-campaign',sent_at:Date.now(),subject:'Historical invitation',body:'Already sent.',content:{},recipients:[{email:'one@example.test',status:'sent',gmail_message_id:'original-1'},{email:'two@example.test',status:'bounced',gmail_message_id:'original-2',notice_id:'bounce-2',error:'550 recipient missing'},{email:'held@example.test',status:'held'}]};
 const preview=await(await request('/outreach/history','POST',payload)).json() as any;assert.equal(preview.accepted,2);assert.equal(preview.known_bounced,1);
 const result=await request('/outreach/history','POST',{...payload,confirm:true,previewId:preview.previewId});assert.equal(result.status,200,await result.clone().text());const {id}=await result.json() as any;
 const read=await(await request(`/campaigns/${id}`)).json() as any;assert.equal(read.report_only,1);assert.equal(read.delivery_stats.accepted,2);assert.equal(read.delivery_stats.bounced,1);assert.equal(read.delivery_stats.skipped,1);assert.equal(read.engagement.tracked,0);
 const {readEmailReport}=await import('../src/emailOutreach');const report=await readEmailReport(env,{userId:'admin',scopes:['org:portal.read']},{organizationId:'org-1',campaignId:id});assert.equal(report.delivery_stats?.accepted,2);assert.match(report.analytics_url,/campaign_id=/);await assert.rejects(()=>readEmailReport(env,{userId:'other-admin',scopes:['org:portal.read']},{organizationId:'org-1',campaignId:id}));
 assert.equal((await request(`/campaigns/${id}/test`,'POST')).status,409);assert.equal((await request(`/campaigns/${id}`,'GET',undefined,'other-admin')).status,404);
 assert.equal((await(await request('/outreach/history','POST',{...payload,confirm:true,previewId:preview.previewId})).json() as any).id,id);
 assert.equal(database.prepare('SELECT count(*) n FROM email_campaigns').get()!.n,1);assert.equal(database.prepare('SELECT count(*) n FROM email_subscriptions').get()!.n,0);
 assert.equal((await request(`/outreach/${id}`,'DELETE')).status,200);assert.equal(database.prepare('SELECT count(*) n FROM email_deliveries').get()!.n,0);assert.equal(database.prepare('SELECT count(*) n FROM email_bounces').get()!.n,1);
});

test('self-tests work with mass sending disabled; review copies follow the primary test and retain individual links and inline photo',async t=>{
 const {env,request,database}=setup(t);await connect(env);let raw='';network(t,async options=>{raw=Buffer.from(JSON.parse(String(options.body)).raw,'base64url').toString();return Response.json({id:'test-receipt'});});
 env.EMAIL_SENDING_ENABLED='false';env.EMAIL_CONTACT_UNSUBSCRIBE_KEY=btoa('k'.repeat(32));
 const image='data:image/jpeg;base64,'+Buffer.from([255,216,255,0]).toString('base64');
 const made=await request('/outreach','POST',{organizationId:'org-1',subject:'Review photo',body:'An invitation.',content:{sender_name:'Community Team',image_data:image},recipients:[{email:'invite@example.test'}]});assert.equal(made.status,201);const {id}=await made.json() as any;
 assert.equal((await request(`/campaigns/${id}/test`,'POST',{recipient:'review@example.test'})).status,409);
 assert.equal((await request(`/campaigns/${id}/test`,'POST')).status,200);await runEmailDelivery(env);
 assert.match(raw,/Content-Type: multipart\/related/);assert.match(raw,/Content-ID: <campaign-photo>/);assert.match(raw,/List-Unsubscribe-Post: List-Unsubscribe=One-Click/);assert.match(raw,/Reply-To: julian@codecollective.us/);
 assert.equal((await request(`/campaigns/${id}/test`,'POST',{recipient:'review@example.test'})).status,200);await runEmailDelivery(env);assert.match(raw,/To: review@example.test/);
 assert.equal(database.prepare("SELECT count(*) n FROM email_deliveries WHERE kind='campaign' AND status='sent'").get()!.n,0);
});

test('bounce evidence requires a permanent failed DSN and exact original message id',async()=>{
 const {bounceEvidence}=await import('../src/emailBounces');
 const part=(text:string)=>({body:{data:Buffer.from(text).toString('base64url')}});
 const failed='Final-Recipient: rfc822; person@example.test\nAction: failed\nStatus: 5.1.1\nOriginal-Message-ID: <12345678-1234-1234-1234-123456789abc@example.test>\nDiagnostic-Code: smtp; 550 mailbox missing';
 assert.deepEqual(bounceEvidence(part(failed)),{email:'person@example.test',deliveryIds:['12345678-1234-1234-1234-123456789abc'],reason:'550 mailbox missing'});
 assert.equal(bounceEvidence(part(failed.replace('Action: failed','Action: delayed'))),null);
 assert.equal(bounceEvidence(part(failed.replace('Status: 5.1.1','Status: 4.2.1'))),null);
 assert.deepEqual(bounceEvidence(part(failed.replace(/Original-Message-ID:[^\n]+/,'')))?.deliveryIds,[]);
});

test('opted-in bounce monitoring continues after the outbox is empty without submitting email',async t=>{
 const {env,database}=setup(t);await connect(env);env.EMAIL_SENDING_ENABLED='false';database.exec('UPDATE email_senders SET can_read_bounces=1');let scans=0;
 t.mock.method(globalThis,'fetch',async(input:string|URL|Request)=>{const url=String(input);if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'test-access'});if(url.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages?')){scans++;return Response.json({messages:[]})}throw Error('Unexpected network request')});
 await runEmailDelivery(env);assert.equal(scans,1);assert.equal(database.prepare('SELECT count(*) n FROM email_send_attempts').get()!.n,0);
});

test('public newsletter accepts email without joining and preserves opt-outs and tenant scope', async t => {
  const { database, env } = setup(t);
  const group = 'ef646755-9443-4c7b-ba4b-a7a29754f666';
  database.prepare('INSERT INTO organizations(id,name,slug) VALUES(?,?,?)').run(group,'LifeTech','lifetech');
  const submit = (email: string, consent=true, origin='https://lifetech.fyi') => app.request('https://portal.test/api/email/newsletter', {
    method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'cf-connecting-ip':'192.0.2.1'},body:JSON.stringify({email,consent,organizationId:'org-2'})
  },env);
  const before = database.prepare('SELECT count(*) n FROM organization_memberships').get()!.n;
  assert.equal((await submit(' NEWS@example.test ')).status,200);
  const row = database.prepare('SELECT * FROM email_subscriptions WHERE email=?').get('news@example.test')!;
  assert.equal(row.user_id,''); assert.equal(row.topic_id,group); assert.equal(row.status,'subscribed');
  assert.equal(row.consent_source,'public-newsletter-form');
  assert.equal(database.prepare('SELECT count(*) n FROM organization_memberships').get()!.n,before);
  assert.equal((await submit('news@example.test')).status,200);
  assert.equal(database.prepare('SELECT count(*) n FROM email_subscriptions').get()!.n,1);
  assert.equal((await submit('invalid')).status,400);
  assert.equal((await submit('other@example.test',false)).status,400);
  assert.equal((await submit('other@example.test',true,'https://other.test')).status,403);
  await subscriptionStatement(env.DB,{id:'alice',email:'alice@example.test',full_name:'Alice'},'organization',group,false).run();
  database.prepare('INSERT INTO email_contact_suppressions(organization_id,email,unsubscribed_at,updated_at) VALUES(?,?,?,?)').run(group,'suppressed@example.test',Date.now(),Date.now());
  assert.equal((await submit('alice@example.test')).status,200);
  assert.equal((await submit('suppressed@example.test')).status,200);
  const alice=database.prepare('SELECT user_id,status FROM email_subscriptions WHERE email=?').get('alice@example.test')!;
  assert.equal(alice.status,'unsubscribed'); assert.equal(alice.user_id,'alice');
  assert.equal(database.prepare('SELECT count(*) n FROM email_subscriptions WHERE email=?').get('suppressed@example.test')!.n,0);
  assert.equal((await submit('fifth@example.test')).status,200);
  assert.equal((await submit('limited@example.test')).status,429);
  assert.equal((await app.request('https://portal.test/api/email/groups/'+group+'/subscribers',{},env)).status,401);
});

test('MCP email-only subscribers and drafts preserve permissions, opt-outs and unsent status', async t => {
  const {env,database}=setup(t);await connect(env);
  const actor={userId:'admin',scopes:['org:portal.read','org:portal.write']};
  const input={organizationId:'org-1',email:'new@example.test',source:'organizer-request'};
  await assert.rejects(addEmailSubscriber(env,{...actor,scopes:['org:portal.read']},input));
  await assert.rejects(addEmailSubscriber(env,{...actor,userId:'other-admin'},input));
  const p=await addEmailSubscriber(env,actor,input);
  assert.equal(database.prepare('SELECT count(*) n FROM email_subscriptions').get()!.n,0);
  await assert.rejects(addEmailSubscriber(env,actor,{...input,name:'Changed',confirm:true,previewId:p.previewId}));
  await addEmailSubscriber(env,actor,{...input,confirm:true,previewId:p.previewId});
  await assert.rejects(addEmailSubscriber(env,actor,{...input,confirm:true,previewId:p.previewId}));
  assert.equal(database.prepare('SELECT user_id FROM email_subscriptions').get()!.user_id,'');
  await subscribe(env,'member','organization','org-1');
  await subscribe(env,'optout','organization','org-1',false);
  await assert.rejects(addEmailSubscriber(env,actor,{...input,email:'optout@example.test'}));
  database.prepare("INSERT INTO email_contact_suppressions(organization_id,email,source,unsubscribed_at,updated_at) VALUES('org-1','blocked@example.test','test',?,?)").run(Date.now(),Date.now());
  await assert.rejects(addEmailSubscriber(env,actor,{...input,email:'blocked@example.test'}));
  const draft={organizationId:'org-1',subject:'Welcome',body:'Join us',audience:'email-only',content:{sender_name:'LifeTech'}};
  const plan=await saveEmailDraft(env,actor,draft);
  assert.equal(plan.recipients,1);
  assert.equal(database.prepare('SELECT count(*) n FROM email_campaigns').get()!.n,0);
  await assert.rejects(saveEmailDraft(env,actor,{...draft,body:'Changed',confirm:true,previewId:plan.previewId}));
  const saved=await saveEmailDraft(env,actor,{...draft,confirm:true,previewId:plan.previewId});
  assert.equal(saved.ownerUserId,'admin');assert.equal(saved.status,'draft');assert.equal(saved.sent,false);
  assert.equal(saved.counts!.recipients,1);
  assert.equal(database.prepare('SELECT email FROM email_deliveries').get()!.email,'new@example.test');
  assert.equal(database.prepare("SELECT count(*) n FROM email_deliveries WHERE status!='draft'").get()!.n,0);
  await assert.rejects(saveEmailDraft(env,actor,{...draft,confirm:true,previewId:plan.previewId}));
  await assert.rejects(readEmailDraft(env,{...actor,userId:'other-admin'},{organizationId:'org-1',campaignId:saved.campaignId}));
  await assert.rejects(readEmailDraft(env,actor,{organizationId:'org-2',campaignId:saved.campaignId}));
  assert.equal((await readEmailWorkspace(env,actor,{organizationId:'org-1'})).counts!.email_only,1);
});

test('MCP drafts reject changed audiences and revoked organizer access', async t => {
  const {env,database}=setup(t);await connect(env);
  const actor={userId:'admin',scopes:['org:portal.read','org:portal.write']};
  const draft={organizationId:'org-1',subject:'Welcome',body:'Hello',audience:'organization'};
  const p=await saveEmailDraft(env,actor,draft);
  await subscribe(env,'late','organization','org-1');
  await assert.rejects(saveEmailDraft(env,actor,{...draft,confirm:true,previewId:p.previewId}));
  const p2=await saveEmailDraft(env,actor,draft);
  database.prepare("UPDATE organization_memberships SET status='inactive' WHERE user_id='admin'").run();
  await assert.rejects(saveEmailDraft(env,actor,{...draft,confirm:true,previewId:p2.previewId}));
  assert.equal(database.prepare('SELECT count(*) n FROM email_campaigns').get()!.n,0);
});
