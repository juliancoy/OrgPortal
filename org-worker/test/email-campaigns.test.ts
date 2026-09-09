import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import test, { type TestContext } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { app } from '../src/index';
import { runEmailDelivery } from '../src/emailDelivery';
import { finishGoogleConnection, startGoogleConnection } from '../src/emailGoogle';
import { decryptSecret, encryptSecret, subscriptionStatement, unsubscribeUrl, type EmailCampaign } from '../src/emailShared';
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
  return Response.json({ id: user, email: user === 'admin' ? 'julian@codecollective.us' : `${user}@example.test`, full_name: 'Julian', is_admin: user === 'admin' || user === 'other-admin' });
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

test('sender OAuth binds browser, account, nonce and one-use state; refresh tokens are encrypted', async (t) => {
  const { env, database } = setup(t);
  const user = { id: 'admin', email: 'julian@codecollective.us' };
  const started = await startGoogleConnection(env, user);
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
  await finishGoogleConnection(env, url.searchParams.get('state')!, started.browser, 'code');
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
  const preview = await (await request('/campaigns', 'POST', payload)).json();
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
  assert.equal((await request(`/campaigns/${preview.id}/send`, 'POST', { fingerprint: preview.fingerprint })).status, 409);
});

test('outbox deduplicates dispatch, honors pauses and late unsubscribes, and counts tests against the rolling quota', async (t) => {
  const { env, request, database } = setup(t);
  const sent: string[] = [];
  network(t, async (options) => { const data = JSON.parse(String(options.body)); sent.push(Buffer.from(data.raw, 'base64url').toString()); return Response.json({ id: `gmail-${sent.length}` }); });
  await connect(env); await subscribe(env); await subscribe(env, 'bob');
  const preview = await (await request('/campaigns', 'POST', payload)).json();
  assert.equal((await request(`/campaigns/${preview.id}/send`, 'POST', { fingerprint: preview.fingerprint })).status, 200);
  assert.equal((await request(`/campaigns/${preview.id}/send`, 'POST', { fingerprint: preview.fingerprint })).status, 409);
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
  await request(`/campaigns/${draft.id}/send`, 'POST', { fingerprint: draft.fingerprint });
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
