import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from '../src/index';
import { EventTestDb } from './event-test-db';

test('contributing organization events require active application evidence and remain distinct from hosted events',async t=>{
 const db=new EventTestDb();t.after(()=>db.close());
 await db.prepare("INSERT INTO organizations(id,name,slug) VALUES('host','Host','host')").run();
 await db.prepare("INSERT INTO events(id,ingest_key,title,slug,host_org_id,starts_at,created_at,updated_at) VALUES('proposal','proposal','Proposed event','proposal','host','2099-01-01','2026-01-01','2026-01-01')").run();
 await db.prepare("INSERT INTO event_submissions(event_id,submission_id,organization_id,submitted_by,title,summary,status,updated_at,expires_at) VALUES('proposal','one','org-one','applicant','Talk','Summary','submitted','2026-01-01','2099-06-01')").run();
 await db.prepare("INSERT INTO organization_support_records(id,from_organization_id,to_organization_id,from_label,to_label,support_kind,description,occurred_at,source_url,evidence,notes,created_at) VALUES('presentation:proposal:one','org-one','host','Organization One','Host','in_kind','Proposed presentation','2099-01-01','https://host.example/events/proposal','Submitted proposal','Not delivered','2026-01-01')").run();
 const get=async(query='')=>{const r=await app.request('https://example.test/api/network/orgs/public/one/events?upcoming_only=true'+query,{}, {DB:db} as unknown as Env);assert.equal(r.status,200);return(await r.json() as {id:string}[]).map(e=>e.id)};
 assert.deepEqual(await get(),['proposal']);assert.deepEqual(await get('&hosted_only=true'),[]);
 await db.prepare("UPDATE organization_support_records SET status='voided' WHERE id='presentation:proposal:one'").run();assert.deepEqual(await get(),[]);
 await db.prepare("UPDATE organization_support_records SET status='reported' WHERE id='presentation:proposal:one'").run();
 await db.prepare("UPDATE event_submissions SET expires_at='2000-01-01'").run();assert.deepEqual(await get(),[]);
});

test('homepage feed includes ongoing hosted events and excludes related and finished events', async t => {
  const db = new EventTestDb();
  t.after(() => db.close());
  await db.prepare("INSERT INTO organizations (id, name, slug) VALUES ('life', 'LifeTech', 'lifetech')").run();
  const now = Date.now();
  for (const [id, host, start, end] of [
    ['ongoing', 'life', -3600000, 3600000],
    ['future', 'life', 7200000, 10800000],
    ['finished', 'life', -7200000, -3600000],
    ['related', 'org-one', 1800000, 3600000],
  ] as const) {
    await db.prepare(`INSERT INTO events (id, ingest_key, title, slug, starts_at, ends_at, host_org_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, id, id, id, new Date(now + start).toISOString(), new Date(now + end).toISOString(), host, new Date(now).toISOString(), new Date(now).toISOString()).run();
  }
  await db.prepare("INSERT INTO event_organizations VALUES ('related', 'life')").run();
  const env = { DB: db } as unknown as Env;
  const events = async (query: string) => {
    const response = await app.request(`https://lifetech.fyi/api/network/orgs/public/lifetech/events?upcoming_only=true${query}`, {}, env);
    assert.equal(response.status, 200);
    return (await response.json() as { id: string }[]).map(event => event.id);
  };
  assert.deepEqual(await events('&hosted_only=true&limit=1'), ['ongoing']);
  assert.deepEqual(await events('&hosted_only=true&limit=1&offset=1'), ['future']);
  assert.deepEqual(await events('&hosted_only=true&limit=1&offset=2'), []);
  assert.deepEqual(await events('&hosted_only=true'), ['ongoing', 'future']);
  assert.deepEqual(await events(''), ['ongoing', 'related', 'future']);
});

test('homepage can retrieve more than one full page of upcoming hosted events', async t => {
  const db = new EventTestDb();
  t.after(() => db.close());
  await db.prepare("INSERT INTO organizations (id, name, slug) VALUES ('life', 'LifeTech', 'lifetech')").run();
  for (let i = 0; i < 205; i++) {
    const id = `future-${String(i).padStart(3, '0')}`;
    await db.prepare(`INSERT INTO events (id, ingest_key, title, slug, starts_at, host_org_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, '2099-01-01T12:00:00Z', 'life', '2026-01-01', '2026-01-01')`).bind(id, id, id, id).run();
  }
  const ids: string[] = [];
  for (let offset = 0; ; offset += 200) {
    const response = await app.request(`https://lifetech.fyi/api/network/orgs/public/lifetech/events?upcoming_only=true&hosted_only=true&limit=200&offset=${offset}`, {}, { DB: db } as unknown as Env);
    assert.equal(response.status, 200);
    const page = await response.json() as { id: string }[];
    ids.push(...page.map(event => event.id));
    if (page.length < 200) break;
  }
  assert.equal(ids.length, 205);
  assert.equal(new Set(ids).size, 205);
  assert.equal(ids[0], 'future-000');
  assert.equal(ids.at(-1), 'future-204');
});
