import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Node fetch mocks do not enforce workerd's Request options. Exercise the actual
// email code in workerd, with synthetic credentials and a local Google stand-in.
test('Google email exchanges work in workerd and never follow credential-bearing redirects', async () => {
  const bundle = await build({ bundle: true, write: false, format: 'esm', platform: 'browser',
    stdin: { resolveDir: process.cwd(), contents: `
      import { finishGoogleConnection, googleAccessToken, sendGmail } from './src/emailGoogle';
      import { encryptSecret } from './src/emailShared';
      export default { async fetch(request) {
        const env = { EMAIL_GOOGLE_CLIENT_ID: 'test-client', EMAIL_GOOGLE_CLIENT_SECRET: 'test-secret',
          EMAIL_GOOGLE_REDIRECT_URI: 'https://portal.test/api/email/google/callback',
          EMAIL_TOKEN_ENCRYPTION_KEY: btoa('x'.repeat(32)) };
        const pending = { owner_user_id: 'test-owner', organization_id: 'test-group',
          verifier_ciphertext: await encryptSecret(env, 'test-verifier', 'oauth:test-owner') };
        env.DB = { prepare(sql) { return { bind() { return this; }, async first() {
          return sql.includes('email_oauth_states') ? pending : { organization_id: 'test-group' };
        }, async run() {} }; } };
        let callback;
        try { await finishGoogleConnection(env, 'test-state', 'test-browser', 'test-code'); }
        catch (error) { callback = { status: error.status, body: await error.getResponse().json() }; }
        const sender = { owner_user_id: 'test-owner', email: 'test@example.test',
          refresh_token_ciphertext: await encryptSecret(env, 'test-refresh', 'sender:test-owner:test@example.test') };
        const accessToken = await googleAccessToken(env, sender);
        const send = await sendGmail('test-access', 'test-message');
        return Response.json({callback, accessToken, send});
      } };` } });
  let redirect = false;
  const requests: string[] = [];
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-06-07', compatibilityFlags: ['nodejs_compat'],
    outboundService: async (request) => {
      requests.push(request.url);
      assert.ok(['https://oauth2.googleapis.com/token', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'].includes(request.url), 'Credentials must never reach a redirect destination');
      if (redirect) return new Response(null, {status: 302, headers: {location: 'https://unexpected.test/steal'}});
      if (request.url.endsWith('/messages/send')) return Response.json({id: 'test-message-id'});
      const body = new URLSearchParams(await request.text());
      assert.equal(body.get('client_secret'), 'test-secret');
      if (body.get('grant_type') === 'authorization_code') {
        assert.equal(body.get('code_verifier'), 'test-verifier');
        return Response.json({error: 'invalid_grant'}, {status: 400});
      }
      assert.equal(body.get('refresh_token'), 'test-refresh');
      return Response.json({access_token: 'test-access'});
    },
  }));
  try {
    const result = await (await mf.dispatchFetch('https://portal.test/')).json() as any;
    assert.equal(result.callback.status, 400);
    assert.match(result.callback.body.detail, /invalid_grant/);
    assert.equal(result.accessToken, 'test-access');
    assert.equal(result.send.status, 'sent');
    assert.equal(requests.length, 3);
    redirect = true;
    const blocked = await (await mf.dispatchFetch('https://portal.test/')).json() as any;
    assert.equal(blocked.callback.status, 400);
    assert.match(blocked.callback.body.detail, /HTTP 302/);
    assert.equal(blocked.accessToken, null);
    assert.equal(blocked.send.status, 'failed');
    assert.equal(requests.length, 6);
  } finally { await mf.dispose(); }
});
