import assert from 'node:assert/strict';
import test from 'node:test';
import { EventTestDb } from './event-test-db';
import { nextEventSlug, runEventSlugOperation } from '../src/eventSlugs';
const actor = { id: 'owner', name: 'Owner', email: null, isOperator: false };
async function fixture() {
  const db = new EventTestDb();
  await db.prepare("INSERT INTO organization_memberships VALUES ('org-one', 'owner', 'administrator', 'active')").run();
  for (const [id, slug] of [['first', 'lifetech-social-1'], ['second', 'old-event'], ['later', 'lifetech-social-4'], ['date', 'lifetech-social-2026-10-20'], ['other', 'lifetech-social-other-50']]) {
    await db.prepare("INSERT INTO events (id, ingest_key, title, slug, host_org_id, created_at, updated_at, description) VALUES (?, ?, 'Social', ?, 'org-one', '2026-10-01', '2026-10-01', 'Keep this')").bind(id, id, slug).run();
  }
  return db;
}
test('series uses the highest exact numeric suffix across all stored events', async t => {
  const db = await fixture(); t.after(() => db.close());
  assert.deepEqual(await nextEventSlug(db, 'lifetech-social'), { series: 'lifetech-social', number: 5, slug: 'lifetech-social-5' });
  assert.equal((await nextEventSlug(db, 'new-series')).slug, 'new-series-1');
  await assert.rejects(nextEventSlug(db, 'Bad Series'));
});
test('rename requires permission and a reviewed unchanged one-use receipt, preserving the event', async t => {
  const db = await fixture(); t.after(() => db.close());
  const args = { eventId: 'second', slug: 'lifetech-social-2' };
  await assert.rejects(runEventSlugOperation(db, { ...actor, id: 'stranger' }, args));
  await assert.rejects(runEventSlugOperation(db, actor, args, 'other-org'));
  const preview = await runEventSlugOperation(db, actor, args);
  assert.equal(preview.before, 'old-event');
  assert.equal((await db.prepare("SELECT slug FROM events WHERE id='second'").first<{slug:string}>())!.slug, 'old-event');
  await assert.rejects(runEventSlugOperation(db, actor, { ...args, slug: 'changed', previewId: preview.previewId, confirm: true }));
  const applied = await runEventSlugOperation(db, actor, { ...args, previewId: preview.previewId, confirm: true });
  assert.equal(applied.success, true);
  const alias = await db.prepare('SELECT event_id FROM event_slug_aliases WHERE slug = ?').bind('old-event').first();
  assert.equal(alias.event_id, 'second');
  const event = await db.prepare("SELECT id, slug, description FROM events WHERE id='second'").first();
  assert.deepEqual({ ...event }, { id: 'second', slug: 'lifetech-social-2', description: 'Keep this' });
  await assert.rejects(runEventSlugOperation(db, actor, { ...args, previewId: preview.previewId, confirm: true }));
  await assert.rejects(runEventSlugOperation(db, actor, { ...args, slug: 'lifetech-social-1' }));
});
