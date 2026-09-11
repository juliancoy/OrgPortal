// Local browser acceptance server: production Worker routes + real SQLite,
// with only the external identity provider replaced by two test members.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { app } from '../../src/index';
import { app as chatApp } from '../../../chat-worker/src/index';
import { TimebankDatabase } from './timebankDatabase';
import { TimebankBucket } from './timebankBucket';
import { importFixture } from './timebankImportFixture';
import { loadSnapshot } from '../../scripts/letsbmore-import.mjs';

const database = new TimebankDatabase();
const bucket = new TimebankBucket();
if (process.env.TIMEBANK_TEST_IMPORTS === '1') await loadSnapshot(importFixture(), async (sql: string, params: any[] = []) => {
  const statement = database.sqlite.prepare(sql);
  return statement.columns().length ? statement.all(...params) : (statement.run(...params), []);
});
for (const migration of ['0001_chat.sql', '0002_message_idempotency_sync.sql', '0003_presence.sql']) {
  database.sqlite.exec(readFileSync(new URL(`../../../chat-worker/migrations/${migration}`, import.meta.url), 'utf8'));
}
const member = (id: string) => ({ id, email: `${id}@example.test`, full_name: id === 'alice' ? 'Alice' : 'Bob', identity_data: { avatar_url: id === 'alice' && process.env.TIMEBANK_TEST_AVATAR_PATH ? '/auth/timebank-test-avatar' : null }, is_sysadmin: id === 'alice' });
globalThis.fetch = async (_input, init) => {
  const id = new Headers(init?.headers).get('Authorization')?.replace('Bearer ', '');
  if (id !== 'alice' && id !== 'bob') return Response.json({}, { status: 401 });
  return Response.json(member(id));
};
const server = createServer(async (request, response) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    const route = (request.url || '').split('?')[0];
    const sessionId = /tb_member=(alice|bob)/.exec(headers.get('cookie') || '')?.[1];
    const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) => {
      response.writeHead(status, { 'Content-Type': 'application/json', ...extra });
      response.end(JSON.stringify(body));
    };
    if (route === '/auth/timebank-test-avatar' && process.env.TIMEBANK_TEST_AVATAR_PATH) {
      response.writeHead(200, { 'Content-Type': 'image/jpeg' });
      return response.end(readFileSync(process.env.TIMEBANK_TEST_AVATAR_PATH));
    }
    if (route === '/auth/session/login') {
      const form = new URLSearchParams(Buffer.concat(chunks).toString());
      const id = form.get('username')?.split('@')[0];
      // Delay exposes redirect-before-login-completes regressions.
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (!['alice', 'bob'].includes(id || '') || form.get('password') !== 'timebank-test') return reply({ detail: 'Invalid credentials' }, 401);
      return reply({ ok: true }, 200, { 'Set-Cookie': `tb_member=${id}; Path=/; HttpOnly; SameSite=Lax` });
    }
    if (route === '/auth/session-token') return reply(sessionId ? { access_token: sessionId } : {}, sessionId ? 200 : 401);
    if (route === '/auth/me') {
      const id = headers.get('Authorization')?.replace('Bearer ', '') || sessionId;
      return reply(id && ['alice', 'bob'].includes(id) ? member(id) : {}, id ? 200 : 401);
    }
    if (route === '/auth/session/logout') return reply({ ok: true }, 200, { 'Set-Cookie': 'tb_member=; Path=/; Max-Age=0' });
    // Unrelated shell notifications are outside this feature fixture.
    if (route === '/api/network/push/status') return reply({ supported: true, configured: false, public_key: null, subscription_ids: [] });
    if (route === '/api/network/notifications/summary') return reply({ unread_count: 0 });
    if (route === '/api/network/connections/requests') return reply([]);
    if (route === '/admin/me') return reply({ is_sysadmin: sessionId === 'alice' || headers.get('Authorization') === 'Bearer alice' });
    if (route === '/api/network/users') return reply([]);
    const selectedApp = route.startsWith('/api/network/chat/') ? chatApp : app;
    const result = await selectedApp.request(`http://localhost${request.url}`, {
      method: request.method, headers,
      ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
    }, { DB: database.asD1(), CONTACTS_DB: database.asD1(), SCAN_IMAGES: bucket.asR2(), PIDP_BASE_URL: 'https://identity.example.test' });
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    console.error(error);
    response.writeHead(500);
    response.end('Test server failed');
  }
});
server.on('upgrade', (_request, socket) => socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'));
server.listen(Number(process.env.TIMEBANK_TEST_PORT || 0), '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address === 'object') console.log(`http://127.0.0.1:${address.port}`);
});
process.on('SIGTERM', () => server.close(() => { database.sqlite.close(); process.exit(0); }));
