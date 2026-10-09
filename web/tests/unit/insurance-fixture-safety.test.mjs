import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const script = new URL('../../scripts/verify-insurance-birthday-contract.mjs', import.meta.url);
test('insurance fixture runner refuses remote services before registering or logging in', () => {
  for (const name of ['VERIFY_PORTAL_BASE_URL', 'VERIFY_PIDP_BASE_URL', 'VERIFY_ORG_API_BASE_URL']) {
    const result = spawnSync(process.execPath, [script.pathname], {
      env: { ...process.env, VERIFY_PORTAL_BASE_URL: 'http://localhost:5173',
        VERIFY_PIDP_BASE_URL: 'http://localhost:8000', VERIFY_ORG_API_BASE_URL: 'http://localhost:8001',
        [name]: 'https://codecollective.us' },
      encoding: 'utf8', timeout: 30000,
    });
    assert.equal(result.status, 1, name);
    assert.match(result.stderr, /Insurance fixtures require localhost/, name);
  }
});
