import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { HTTPException } from 'hono/http-exception';
import { nametagRoutes } from '../src/nametags';

test('admin nametags paginate every profile without exposing contact details', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE user_contact_pages (id TEXT, user_id TEXT, user_name TEXT, slug TEXT, photo_url TEXT, enabled INTEGER, user_email TEXT)');
  for (let n = 0; n < 7; n++) sql.prepare('INSERT INTO user_contact_pages VALUES (?, ?, ?, ?, ?, ?, ?)').run(String(n), `u${n}`, `Person ${n}`, `person-${n}`, '', n % 2, 'private@example.com');
  const DB = { prepare(query: string) { return { bind(...args: (string | number)[]) { return { async all() { return { results: sql.prepare(query).all(...args) }; } }; } }; } } as unknown as D1Database;
  const app = nametagRoutes(async (_env, request) => {
    if (!request.headers.has('Authorization')) throw new HTTPException(401);
    if (request.headers.get('Authorization') !== 'admin') throw new HTTPException(403);
  });
  const request = (path: string, token?: string) => app.fetch(new Request(`https://local.test/${path}`, { headers: token ? { Authorization: token } : {} }), { DB } as Env);
  try {
    assert.equal((await request('?limit=2')).status, 401);
    assert.equal((await request('?limit=2', 'member')).status, 403);
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await request(`?limit=2${cursor ? `&cursor=${cursor}` : ''}`, 'admin');
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const data = await response.json() as { people: { user_id: string; public: boolean }[]; next_cursor: string | null };
      assert.ok(!JSON.stringify(data).includes('private@example.com'));
      ids.push(...data.people.map(person => person.user_id));
      cursor = data.next_cursor;
    } while (cursor);
    assert.deepEqual(ids, ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6']);
  } finally { sql.close(); }
});
