import assert from "node:assert/strict";
import test from "node:test";
import { EventTestDb } from "./event-test-db";
import { app } from "../src/index";

test("organization listings apply ownership and upcoming dates before limiting", async () => {
  const db = new EventTestDb();
  try {
    const insert = db.prepare(`INSERT INTO events
      (id, ingest_key, title, slug, host_org_id, starts_at, created_at, updated_at, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]')`);
    await insert.bind("past", "test:past", "Old meetup", "past", "org-one", "2000-01-01T10:00:00Z", "2000-01-01", "2000-01-01").run();
    await insert.bind("other", "test:other", "Medical conference", "other", "other-org", "2099-01-01T10:00:00Z", "2026-01-01", "2026-01-01").run();
    await insert.bind("future", "test:future", "Our gathering", "future", "org-one", "2099-01-02T10:00:00Z", "2026-01-01", "2026-01-01").run();
    const response = await app.request("https://example.com/api/network/orgs/public/one/events?upcoming_only=true&limit=1", undefined, { DB: db } as unknown as Env);
    assert.equal(response.status, 200);
    const rows = await response.json() as { id: string }[];
    assert.deepEqual(rows.map(row => row.id), ["future"]);
    const missing = await app.request("https://example.com/api/network/orgs/public/missing/events?upcoming_only=true", undefined, { DB: db } as unknown as Env);
    assert.deepEqual(await missing.json(), []);
  } finally { db.close(); }
});

test('public event introduction follows its organization profile independently of event copy',async()=>{
 const db=new EventTestDb();try{
  db.sqlite.exec("UPDATE organizations SET description='Organization-owned introduction' WHERE id='org-one'; INSERT INTO events(id,ingest_key,title,slug,host_org_id,description,starts_at,created_at,updated_at,tags) VALUES('intro','test:intro','Our gathering','intro','org-one','Event-specific details','2099-01-01T12:00:00Z','2026-01-01','2026-01-01','[]')");
  const get=async()=>{const response=await app.request('https://example.com/api/network/events/public/intro',undefined,{DB:db} as unknown as Env);assert.equal(response.status,200);return response.json() as Promise<{description:string;organization_description:string}>};
  assert.equal((await get()).organization_description,'Organization-owned introduction');
  db.sqlite.exec("UPDATE organizations SET description='Updated organization introduction' WHERE id='org-one'");
  const updated=await get();assert.equal(updated.organization_description,'Updated organization introduction');assert.equal(updated.description,'Event-specific details');
 }finally{db.close()}
});
