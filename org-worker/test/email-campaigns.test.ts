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
    EMAIL_POSTAL_ADDRESS: 'Test mailing address', EMAIL_SENDING_ENABLED: 'true', EMAIL_DAILY_LIMIT: '250',
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
const payload = { event_id: 'event-1', audience: 'event', subject: 'Hello {{first_name}}', body: 'Join {{event_title}}.' };

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
  assert.equal(create.status,201);const draft=await create.json();assert.equal(draft.recipient_count,1);assert.match(draft.preview.html,/Visit group/);assert.doesNotMatch(draft.preview.html,/Date to be announced/);
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
  assert.equal(database.prepare('SELECT status FROM email_deliveries').get()!.status,'skipped');
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
  const preview=await (await request(`/campaigns/${draft.id}`)).json();
  assert.equal((await request(`/campaigns/${draft.id}/send`, 'POST', {fingerprint:preview.fingerprint,preview_id:preview.preview_id,confirm:true})).status,200);
  await runEmailDelivery(env); assert.equal(attempts, 0);
  database.prepare('UPDATE email_campaigns SET scheduled_at = 0').run();
  env.EMAIL_SENDING_ENABLED = 'false'; await runEmailDelivery(env); assert.equal(attempts, 0);
  env.EMAIL_SENDING_ENABLED = 'true'; await runEmailDelivery(env); await runEmailDelivery(env);
  assert.equal(attempts, 1);
  assert.equal(database.prepare('SELECT status FROM email_deliveries').get()!.status, 'uncertain');
});

test('templates escape personalized HTML and encode Unicode mail with individual recipients', async (t) => {
  const { env, request, database } = setup(t);
  network(t); await connect(env); await subscribe(env);
  const draft = await (await request('/campaigns', 'POST', { ...payload, body: 'Hi {{first_name}}, <script>alert(1)</script>', subject: 'Welcome 👋 {{first_name}}' })).json();
  const campaign = database.prepare('SELECT * FROM email_campaigns WHERE id = ?').get(draft.id) as unknown as EmailCampaign;
  const rendered = renderCampaign(env, campaign, '<img>\r\nBcc:bad@example.test', null);
  assert.doesNotMatch(rendered.html, /<script>/); assert.match(rendered.html, /&lt;script&gt;/);
  const raw = campaignMime(env, campaign, { id: 'id-1', email: 'alice@example.test', name: 'Álice', kind: 'campaign' }, 'https://portal.test/unsubscribe?token=test');
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
  assert.deepEqual(result.setup_issues, ['Google OAuth client ID', 'Sender token encryption key', 'Matching portal and Google callback hosts', 'Sender mailing address']);
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
  const mime = campaignMime(env, draft, {email:'alice@example.test',name:'Alice',id:'delivery',kind:'test'},null);
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
