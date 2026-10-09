import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HTTPException } from 'hono/http-exception';
import { EventTestDb } from './event-test-db';
import { companyVoteRoutes } from '../src/companyVotes';

test('company voting isolates users/events, replaces votes, rejects non-roster companies and enforces closing', async () => {
  const db = new EventTestDb();
  try {
    await db.prepare('PRAGMA foreign_keys = ON').run();
    await db.prepare(`INSERT INTO events (id,ingest_key,title,slug,created_at,updated_at)
      VALUES ('pitch','pitch','Pitch','pitch','',''),('other','other','Other','other','',''),('ordinary','ordinary','Ordinary','ordinary','','')`).run();
    await db.prepare("INSERT INTO organizations (id,name,slug) VALUES ('a','Alpha','alpha'),('b','Beta','beta'),('outsider','Outsider','outsider')").run();
    await db.prepare("UPDATE organizations SET description='Shared organization description', image_url='https://alpha.example/logo.png' WHERE id='a'").run();
    await db.prepare("INSERT INTO event_company_ballots (event_id,closes_at,enabled) VALUES ('pitch','2099-10-09T00:00:00Z',1),('other','2099-10-09T00:00:00Z',1)").run();
    await db.prepare("INSERT INTO event_pitch_companies VALUES ('pitch','a'),('pitch','b'),('other','a')").run();
    const d1 = db as unknown as D1Database;
    const app = companyVoteRoutes(async (_env, req) => {
      const id = req.headers.get('authorization');
      if (!id) throw new HTTPException(401);
      return { id };
    });
    const request = (path: string, user?: string, body?: unknown) => app.fetch(new Request(`https://example.test/${path}`, {
      method: body === undefined ? 'GET' : 'PUT', headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: user } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), { DB: d1 } as Env);
    const summary = async () => (await request('pitch/company-votes/public')).json() as Promise<{companies: {id: string; description: string | null; upvotes: number; downvotes: number; score: number}[]; closed: boolean}>;
    assert.equal((await request('pitch/company-votes/a', undefined, { value: 1 })).status, 401);
    assert.equal((await request('pitch/company-votes')).status, 401);
    for (const body of [{value:2},{value:'1'},{value:true},{value:null},{value:1,user_id:'victim'},[],null])
      assert.equal((await request('pitch/company-votes/a', 'alice', body)).status, 400);
    assert.equal((await request('missing/company-votes/public')).status, 404);
    assert.equal((await request('pitch/company-votes/outsider', 'alice', { value: 1 })).status, 409);
    assert.equal((await request('ordinary/company-votes/a', 'alice', { value: 1 })).status, 409);
    assert.equal((await (await request('ordinary/company-votes/public')).json() as {available: boolean}).available, false);
    for (let i = 0; i < 2; i++) assert.equal((await request('pitch/company-votes/a', 'alice', { value: 1 })).status, 200);
    await request('pitch/company-votes/a', 'bob', { value: -1 });
    await request('other/company-votes/a', 'alice', { value: 1 });
    let data = await summary();
    assert.deepEqual(data.companies.find(company => company.id === 'a'), {id:'a',name:'Alpha',slug:'alpha',image_url:'https://alpha.example/logo.png',description:'Shared organization description',upvotes:1,downvotes:1,score:0});
    await db.prepare("UPDATE organizations SET description='Updated profile description' WHERE id='a'").run();
    assert.equal((await summary()).companies.find(company => company.id === 'a')!.description, 'Updated profile description');
    assert.ok(!JSON.stringify(data).includes('alice') && !JSON.stringify(data).includes('user_id'));
    assert.deepEqual(await (await request('pitch/company-votes', 'alice')).json(), {votes:{a:1}});
    assert.deepEqual(await (await request('pitch/company-votes', 'victim')).json(), {votes:{}});
    assert.equal((await request('pitch/company-votes/a', 'alice', { value: -1 })).status, 200);
    data = await summary(); assert.equal(data.companies.find(company => company.id === 'a')!.score, -2);
    await db.prepare("UPDATE event_company_ballots SET enabled=0 WHERE event_id='pitch'").run();
    assert.equal((await request('pitch/company-votes/a', 'alice', { value: 1 })).status, 409);
    assert.equal((await summary()).closed, true);
    await db.prepare("UPDATE event_company_ballots SET enabled=1, closes_at='2000-01-01T00:00:00Z' WHERE event_id='pitch'").run();
    assert.equal((await request('pitch/company-votes/b', 'alice', { value: 1 })).status, 409);
    assert.equal((await summary()).closed, true);
    assert.equal((await request('pitch/company-votes/a', 'alice', { value: 0 })).status, 200);
    assert.equal((await db.prepare("SELECT COUNT(*) n FROM event_company_votes WHERE event_id='pitch' AND user_id='alice'").first())!.n, 0);
    await db.prepare("UPDATE event_company_votes SET expires_at='2000-01-01T00:00:00Z' WHERE event_id='pitch'").run();
    assert.equal((await summary()).companies.find(company => company.id === 'a')!.downvotes, 0);
    assert.deepEqual(await (await request('pitch/company-votes', 'bob')).json(), {votes:{}});
    await db.prepare("DELETE FROM event_pitch_companies WHERE event_id='other' AND organization_id='a'").run();
    assert.equal((await db.prepare("SELECT COUNT(*) n FROM event_company_votes WHERE event_id='other'").first())!.n, 0);
  } finally { db.close(); }
});

test('Amplify seed links exactly five existing companies to the verified event', async () => {
  const db = new EventTestDb();
  try {
    await db.prepare(`INSERT INTO events (id,ingest_key,title,slug,host_org_id,created_at,updated_at)
      VALUES ('15dc061b-d8a5-4cc5-ad94-e9a704c24b01','amplify','Pitch','amplify','org-amplify-medtech','','')`).run();
    for (const id of ['org-bluehealer','org-salynt','org-liquet-medical','org-rubitection','org-wearabledose'])
      await db.prepare('INSERT INTO organizations (id,name,slug) VALUES (?,?,?)').bind(id,id,id.slice(4)).run();
    const sql = readFileSync(new URL('../migrations/0080_event_company_votes.sql', import.meta.url), 'utf8');
    for (const statement of sql.slice(sql.indexOf('INSERT INTO event_company_ballots')).split(';').filter(s => s.trim()))
      await db.prepare(statement).run();
    const rows = await db.prepare('SELECT * FROM event_pitch_companies').all();
    assert.equal(rows.results.length, 5);
    assert.ok(rows.results.every(row => row.event_id === '15dc061b-d8a5-4cc5-ad94-e9a704c24b01'));
    assert.equal((await db.prepare('SELECT closes_at FROM event_company_ballots').first())!.closes_at, '2026-10-16T00:00:00Z');
  } finally { db.close(); }
});
