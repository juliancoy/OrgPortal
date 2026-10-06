import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, run } from '../scripts/orgportal.mjs';

test('CLI selects portal-bound account connections and rejects malformed targets', () => {
  const command = parseCommand(['auth', 'login', '--portal', 'https://medtech.social', '--connection', 'work', '--no-browser'], {});
  assert.equal(command.resource, 'https://medtech.social/api/org/mcp');
  assert.equal(command.connection, 'work');
  assert.equal(command.openBrowser, false);
  assert.equal(parseCommand(['auth', 'login'], {}).openBrowser, false);
  assert.equal(parseCommand(['auth', 'login', '--browser'], {}).openBrowser, true);
  assert.equal(parseCommand(['auth', 'logout'], {}).resource, 'https://lifetech.fyi/api/org/mcp');
  for (const args of [['auth', 'delete'], ['auth', 'login', '--portal', 'http://example.com'],
    ['auth', 'login', '--issuer', 'https://example.com/path'], ['auth', 'login', '--resource', 'https://user:secret@example.com/mcp'],
    ['auth', 'logout', '--connection', '../other']]) assert.throws(() => parseCommand(args, {}));
});

test('login verifies access; logout revokes; both release keyring locks', async () => {
  for (const action of ['login', 'logout']) {
    const calls: string[] = [];
    await run(['auth', action, '--connection', 'work'], { env: {}, log: () => {},
      credentialStore: async (_resource, _issuer, name) => {
        assert.equal(name, 'work');
        return { load: async () => ({ refreshToken: 'test-only' }), release: async () => { calls.push('release'); } };
      },
      browserLogin: async (_resource, _issuer, _client, _open, options) => {
        assert.equal(options.disconnect, action === 'logout');
        assert.match(options.scope, /org:portal.write/);
        return { accessToken: async () => { calls.push('verify'); }, disconnect: async () => { calls.push('revoke'); }, close: async () => { calls.push('close'); } };
      },
    });
    assert.deepEqual(calls, [action === 'login' ? 'verify' : 'revoke', 'close', 'release']);
  }
});

test('logout without a saved grant is offline and idempotent', async () => {
  let released = false;
  await run(['auth', 'logout'], { env: {}, log: () => {},
    credentialStore: async () => ({ load: async () => ({ clientId: 'registered' }), release: async () => { released = true; } }),
    browserLogin: async () => { assert.fail('Must not start authorization'); },
  });
  assert.equal(released, true);
});

test('failed revocation reports failure and still releases the keyring lock', async () => {
  let released = false;
  await assert.rejects(run(['auth', 'logout'], { env: {}, log: () => {},
    credentialStore: async () => ({ load: async () => ({ refreshToken: 'test-only' }), release: async () => { released = true; } }),
    browserLogin: async () => ({ disconnect: async () => { throw Error('Revocation unavailable'); }, close: async () => {} }),
  }), /Revocation unavailable/);
  assert.equal(released, true);
});
test('journal mirror uses infrastructure credentials without starting PIdP account login', async () => {
  let mirrored = false;
  await run(['journal', 'sync', '--file', '/tmp/operator-journal.sqlite'], { env: {}, log: () => {},
    credentialStore: async () => { assert.fail('Journal operator command must not use account credentials'); },
    mirrorChangeJournal: async file => { assert.equal(file, '/tmp/operator-journal.sqlite'); mirrored = true; return { entries: 0 }; },
  });
  assert.equal(mirrored, true);
  assert.throws(() => parseCommand(['journal', 'sync', '--portal', 'https://medtech.social'], {}), /operator credentials/);
});
