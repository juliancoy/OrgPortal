import test from 'node:test';
import assert from 'node:assert/strict';
import { EventTestDb } from './event-test-db';
import { uploadEventMedia, handleEventMediaUpload } from '../src/eventMediaUpload';
import { callbackResult, browserLogin } from '../scripts/event-upload.mjs';
import { createHash } from 'node:crypto';

const identity = { userId: 'pidp-user', scopes: ['org:events.read', 'org:events.write'] };
async function fixture() {
  const db = new EventTestDb();
  await db.prepare("ALTER TABLE events ADD COLUMN media_json TEXT NOT NULL DEFAULT '[]'").run();
  await db.prepare("INSERT INTO events (id, ingest_key, title, slug, host_org_id, created_at, updated_at) VALUES ('event-one', 'one', 'Test Event', 'one', 'org-one', '', '')").run();
  const objects = new Map();
  const env = { DB: db, SCAN_IMAGES: { async put(key, data) { objects.set(key, data); }, async delete(key) { objects.delete(key); } } } as unknown as Env;
  return { db, objects, env };
}
function request(fields: Record<string, string> = {}, bytes = [255, 216, 255, 224]) {
  const form = new FormData();
  form.set('organizationId', 'org-one'); form.set('eventId', 'one');
  form.set('image', new File([new Uint8Array(bytes)], 'menu.jpg', { type: 'image/jpeg' }));
  Object.entries(fields).forEach(([key, value]) => form.set(key, value));
  return new Request('https://portal.example/mcp/uploads/event-media', { method: 'POST', body: form });
}

test('account upload previews, appends, audits and rejects replay without another object', async () => {
  const f = await fixture(); try {
    const preview = await uploadEventMedia(request(), f.env, identity);
    assert.equal(preview.dryRun, true); assert.equal(f.objects.size, 0);
    const result = await uploadEventMedia(request({ confirm: 'true', previewId: preview.previewId }), f.env, identity);
    assert.equal(result.success, true); assert.equal(f.objects.size, 1);
    const row = await f.db.prepare('SELECT media_json FROM events').first();
    assert.equal(JSON.parse(row.media_json)[0].label, 'menu.jpg');
    assert.equal((await f.db.prepare('SELECT status FROM event_mcp_operations').first()).status, 'completed');
    await assert.rejects(uploadEventMedia(request({ confirm: 'true', previewId: preview.previewId }), f.env, identity), /Preview/);
    assert.equal(f.objects.size, 1);
  } finally { f.db.close(); }
});

test('upload denies missing scopes, wrong organization, inactive membership, tampering and unpreviewed writes', async () => {
  const f = await fixture(); try {
    await assert.rejects(uploadEventMedia(request(), f.env, { ...identity, scopes: ['org:events.read'] }), /scope/);
    await assert.rejects(uploadEventMedia(request({ organizationId: 'other' }), f.env, identity), /belong/);
    await assert.rejects(uploadEventMedia(request(), f.env, { ...identity, userId: 'other-user' }), /management/);
    await assert.rejects(uploadEventMedia(request({ confirm: 'true' }), f.env, identity), /Preview/);
    await assert.rejects(uploadEventMedia(request({}, [1, 2, 3]), f.env, identity), /content/);
    const preview = await uploadEventMedia(request(), f.env, identity);
    await assert.rejects(uploadEventMedia(request({ confirm: 'true', previewId: preview.previewId }, [255, 216, 255, 225]), f.env, identity), /Preview/);
    await f.db.prepare("UPDATE organization_memberships SET status='inactive'").run();
    await assert.rejects(uploadEventMedia(request({ confirm: 'true', previewId: preview.previewId }), f.env, identity), /management/);
    assert.equal(f.objects.size, 0);
  } finally { f.db.close(); }
});

test('concurrent gallery edit during storage write is retained and unattached object removed', async () => {
  const f = await fixture(); try {
    const preview = await uploadEventMedia(request(), f.env, identity);
    const put = f.env.SCAN_IMAGES!.put;
    f.env.SCAN_IMAGES!.put = async (...args) => {
      await f.db.prepare('UPDATE events SET media_json = ?').bind('[{"id":"concurrent"}]').run();
      return put(...args);
    };
    const result = await uploadEventMedia(request({ confirm: 'true', previewId: preview.previewId }), f.env, identity);
    assert.equal(result.success, false);
    assert.equal(f.objects.size, 0);
    assert.equal((await f.db.prepare('SELECT media_json FROM events').first()).media_json, '[{"id":"concurrent"}]');
  } finally { f.db.close(); }
});

test('OAuth upload endpoint requires a token and live revocation configuration', async () => {
  const f = await fixture(); try {
    Object.assign(f.env, { MCP_PUBLIC_URL: 'https://portal.example/mcp', MCP_OAUTH_ISSUER: 'https://id.example',
      MCP_OAUTH_JWKS_URL: 'https://id.example/.well-known/jwks.json', MCP_SUBJECT_MAP_JSON: '{}' });
    assert.equal((await handleEventMediaUpload(request(), f.env)).status, 503);
    Object.assign(f.env, { MCP_OAUTH_INTROSPECTION_URL: 'https://id.example/oauth/mcp/introspect', MCP_OAUTH_INTROSPECTION_SECRET: 'secret' });
    const response = await handleEventMediaUpload(request(), f.env);
    assert.equal(response.status, 401); assert.match(response.headers.get('www-authenticate')!, /resource_metadata/);
    assert.equal(f.objects.size, 0);
  } finally { f.db.close(); }
});

test('local callback binds issuer and state, rejects duplicate parameters and denial', () => {
  const good = 'http://127.0.0.1:1234/callback?state=state&iss=https%3A%2F%2Fid.example&code=code';
  assert.equal(callbackResult(new URL(good), 'state', 'https://id.example'), 'code');
  assert.throws(() => callbackResult(new URL(good), 'wrong', 'https://id.example'));
  assert.throws(() => callbackResult(new URL(good), 'state', 'https://other.example'));
  assert.throws(() => callbackResult(new URL(good + '&state=state'), 'state', 'https://id.example'));
  assert.throws(() => callbackResult(new URL(good + '&error=access_denied'), 'state', 'https://id.example'));
});

test('browser login receives a loopback callback, exchanges PKCE without a secret, and revokes in-memory credentials', async () => {
  const originalFetch = globalThis.fetch, originalLog = console.log;
  let authorization: URL;
  let callback: Promise<void>;
  let revoked = false;
  const logs: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith('http://127.0.0.1:')) return originalFetch(input, init);
    if (url.endsWith('/.well-known/oauth-authorization-server')) return Response.json({ issuer: 'https://id.example',
      authorization_endpoint: 'https://id.example/oauth/mcp/authorize', token_endpoint: 'https://id.example/oauth/mcp/token',
      revocation_endpoint: 'https://id.example/oauth/mcp/revoke', code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'], authorization_response_iss_parameter_supported: true });
    const body = init!.body as URLSearchParams;
    assert.equal(body.has('client_secret'), false);
    if (url.endsWith('/token')) {
      assert.equal(body.get('code'), 'issued-code');
      assert.equal(body.get('redirect_uri'), authorization.searchParams.get('redirect_uri'));
      assert.equal(createHash('sha256').update(body.get('code_verifier')!).digest('base64url'), authorization.searchParams.get('code_challenge'));
      return Response.json({ access_token: 'private-access-token', refresh_token: 'private-refresh-token', expires_in: 300 });
    }
    assert.ok(url.endsWith('/revoke')); assert.equal(body.get('token'), 'private-refresh-token'); revoked = true;
    return new Response(null, { status: 200 });
  };
  console.log = message => {
    logs.push(message);
    authorization = new URL(message.split('\n')[1]);
    callback = (async () => {
      const target = new URL(authorization.searchParams.get('redirect_uri')!);
      target.search = new URLSearchParams({ state: 'wrong', iss: 'https://id.example', code: 'issued-code' }).toString();
      assert.equal((await originalFetch(target)).status, 400);
      target.searchParams.set('state', authorization.searchParams.get('state')!);
      assert.equal((await originalFetch(target)).status, 200);
    })();
    callback.catch(() => {});
  };
  try {
    const connection = await browserLogin('https://portal.example/mcp', 'https://id.example', 'local', false);
    await callback!;
    assert.equal(await connection.accessToken(), 'private-access-token');
    await connection.close(); assert.equal(revoked, true);
    assert.ok(logs.every(message => !message.includes('private-access-token') && !message.includes('private-refresh-token')));
  } finally { globalThis.fetch = originalFetch; console.log = originalLog; }
});
