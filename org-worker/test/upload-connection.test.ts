import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Native uploader is an ES module outside the worker build.
import { tokenConnection, connectionKey } from '../scripts/upload-connection.mjs';
// @ts-expect-error Native uploader is an ES module outside the worker build.
import { browserLogin } from '../scripts/event-upload.mjs';

const metadata = { token_endpoint: 'https://id.example/token', revocation_endpoint: 'https://id.example/revoke' };
const base = { resource: 'https://portal.example/mcp', clientId: 'client', metadata };
const token = { access_token: 'access', refresh_token: 'refresh', expires_in: 300 };
function memoryStore() {
  let record: any;
  return { async save(value: any) { record = structuredClone(value); }, async load() { return structuredClone(record); } };
}

test('persistent close retains only refresh credentials and restart rotates them once', async () => {
  const store = memoryStore();
  const first = await tokenConnection({ ...base, token, store });
  await first.close();
  assert.deepEqual(await store.load(), { clientId: 'client', refreshToken: 'refresh', pending: false });
  let calls = 0;
  const second = await tokenConnection({ ...base, store, saved: await store.load(), requestJson: async (_url: string, init: any) => {
    calls++;
    assert.equal((await store.load()).pending, true);
    assert.equal(init.body.get('refresh_token'), 'refresh');
    return { ...token, refresh_token: 'rotated' };
  } });
  assert.deepEqual(await Promise.all([second.accessToken(), second.accessToken()]), ['access', 'access']);
  assert.equal(calls, 1);
  assert.equal((await store.load()).refreshToken, 'rotated');
  await second.close();
  assert.equal((await store.load()).pending, false);
});

test('ambiguous refresh cannot replay after restart', async () => {
  const store = memoryStore();
  let calls = 0;
  const args = { ...base, store, saved: { refreshToken: 'refresh' }, requestJson: async () => { calls++; throw new Error('network'); } };
  const first = await tokenConnection(args);
  await assert.rejects(first.accessToken(), /network/);
  await first.close();
  const second = await tokenConnection({ ...args, saved: await store.load() });
  await assert.rejects(second.accessToken(), /uncertain/);
  assert.equal(calls, 1);
});

test('disconnect revokes before removing saved token; server failure retains it', async () => {
  const store = memoryStore();
  const connection = await tokenConnection({ ...base, token, store });
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(connection.disconnect(), /Disconnect failed/);
    assert.equal((await store.load()).refreshToken, 'refresh');
    globalThis.fetch = async (_url, init) => {
      assert.equal((init!.body as URLSearchParams).get('token'), 'refresh');
      return new Response(null, { status: 200 });
    };
    await connection.disconnect();
    assert.deepEqual(await store.load(), { clientId: 'client' });
    await assert.rejects(connection.accessToken());
  } finally { globalThis.fetch = original; }
});

test('failed keyring write prevents refresh request', async () => {
  let calls = 0;
  const connection = await tokenConnection({ ...base, saved: { refreshToken: 'refresh' },
    store: { save: async () => { throw new Error('keyring unavailable'); } }, requestJson: async () => { calls++; } });
  await assert.rejects(connection.accessToken(), /keyring/);
  assert.equal(calls, 0);
});

test('credential namespace includes issuer and exact resource', () => {
  assert.notEqual(connectionKey('https://portal.example/mcp', 'https://id.example'), connectionKey('https://portal.example/other', 'https://id.example'));
  assert.notEqual(connectionKey('https://portal.example/mcp', 'https://id.example'), connectionKey('https://portal.example/mcp', 'https://other.example'));
});

test('dynamic registration and consent happen once; later process reuses saved account', async () => {
  const store = memoryStore();
  const originalFetch = globalThis.fetch, originalLog = console.log;
  let registrations = 0, consents = 0, refreshes = 0;
  let callback: Promise<Response> | undefined;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/.well-known/oauth-authorization-server')) return Response.json({ ...metadata, issuer: 'https://id.example',
      authorization_endpoint: 'https://id.example/authorize', registration_endpoint: 'https://id.example/register',
      code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'], authorization_response_iss_parameter_supported: true });
    if (url.endsWith('/register')) { registrations++; return Response.json({ client_id: 'registered' }); }
    assert.equal(url, metadata.token_endpoint);
    const body = init!.body as URLSearchParams;
    assert.equal(body.get('client_id'), 'registered');
    if (body.get('grant_type') === 'refresh_token') refreshes++;
    return Response.json({ ...token, refresh_token: `refresh-${refreshes}` });
  };
  console.log = (message: string) => {
    consents++;
    const authorization = new URL(message.split('\n')[1]);
    const target = new URL(authorization.searchParams.get('redirect_uri')!);
    target.search = new URLSearchParams({ code: 'code', iss: 'https://id.example', state: authorization.searchParams.get('state')! }).toString();
    callback = originalFetch(target);
    callback.catch(() => {});
  };
  try {
    const first = await browserLogin(base.resource, 'https://id.example', undefined, false, { store });
    assert.equal((await callback!).status, 200);
    await first.close();
    const second = await browserLogin(base.resource, 'https://id.example', undefined, false, { store });
    assert.equal(await second.accessToken(), 'access');
    await second.close();
    assert.deepEqual([registrations, consents, refreshes], [1, 1, 1]);
  } finally { globalThis.fetch = originalFetch; console.log = originalLog; }
});
