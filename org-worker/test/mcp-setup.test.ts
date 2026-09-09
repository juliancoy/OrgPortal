import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from '../src/index';
import { checkEventConfiguration } from '../src/eventConfiguration';

test('MCP setup identifies missing settings without exposing configured values', () => {
  const status = checkEventConfiguration({ MCP_PUBLIC_URL: 'https://private.example/mcp', MCP_SUBJECT_MAP_JSON: 'secret-invalid-value' } as Env);
  assert.deepEqual(status.missingSettings, ['MCP_OAUTH_ISSUER', 'MCP_OAUTH_JWKS_URL', 'EVENT_INTEGRATIONS_JSON']);
  assert.equal(status.ok, false);
  assert.equal(status.liveConnectivityChecked, false);
  assert.ok(!JSON.stringify(status).includes('private.example'));
  assert.ok(!JSON.stringify(status).includes('secret-invalid-value'));
});

test('setup status requires a portal administrator even when MCP OAuth is absent', async () => {
  const env = { PIDP_BASE_URL: 'https://identity.example' } as Env;
  const url = 'https://portal.example/admin/mcp/status';
  assert.equal((await app.request(url, {}, env)).status, 401);
  const originalFetch = globalThis.fetch;
  try {
    let admin = false;
    globalThis.fetch = async () => Response.json({ id: 'user', is_sysadmin: admin });
    const options = { headers: { authorization: 'Bearer test-token' } };
    assert.equal((await app.request(url, options, env)).status, 403);
    admin = true;
    const response = await app.request(url, options, env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json() as { missingSettings: string[]; ok: boolean };
    assert.equal(result.ok, false);
    assert.ok(result.missingSettings.includes('MCP_OAUTH_ISSUER'));
  } finally { globalThis.fetch = originalFetch; }
});
