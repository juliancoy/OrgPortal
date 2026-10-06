import assert from 'node:assert/strict';
import test from 'node:test';
import { EventTestDb } from './event-test-db';
import { runEventHostOperation } from '../src/eventHost';
const actor = { id: 'pidp-user', name: 'Owner', email: null, isOperator: false };

test('host transfer requires both organizations, preserves the event, and consumes an unchanged preview', async () => {
  const db = new EventTestDb();
  try {
    await db.prepare("INSERT INTO organizations (id, name, slug, source_url) VALUES ('lifetech', 'LifeTech', 'lifetech', 'https://lifetech.fyi')").run();
    await db.prepare(`INSERT INTO events (id, ingest_key, title, slug, host_org_id, host_org_name, created_at, updated_at)
      VALUES ('event-one', 'test:event', 'Life Tech Social', 'old-medtech', 'org-one', 'One', '2026-10-01', '2026-10-01')`).run();
    const args = { eventId: 'event-one', organizationId: 'lifetech', tags: ['LifeTech', 'Healthcare'] };
    await assert.rejects(runEventHostOperation(db as unknown as D1Database, actor, args), /management access/);
    await db.prepare("INSERT INTO organization_memberships VALUES ('lifetech', 'pidp-user', 'administrator', 'active')").run();
    const preview = await runEventHostOperation(db as unknown as D1Database, actor, args);
    const applied = await runEventHostOperation(db as unknown as D1Database, actor, { ...args, previewId: preview.previewId, confirm: true });
    assert.equal(applied.success, true);
    const event = await db.prepare('SELECT title, slug, host_org_id, host_org_name, tags FROM events WHERE id = ?').bind('event-one').first();
    assert.deepEqual({ ...event }, { title: 'Life Tech Social', slug: 'old-medtech', host_org_id: 'lifetech', host_org_name: 'LifeTech', tags: '["LifeTech","Healthcare"]' });
    await assert.rejects(runEventHostOperation(db as unknown as D1Database, actor, { ...args, previewId: preview.previewId, confirm: true }));
    const reverse = { eventId: 'event-one', organizationId: 'org-one' };
    const second = await runEventHostOperation(db as unknown as D1Database, actor, reverse);
    await db.prepare("UPDATE organization_memberships SET status = 'inactive' WHERE organization_id = 'lifetech'").run();
    await assert.rejects(runEventHostOperation(db as unknown as D1Database, actor, { ...reverse, previewId: second.previewId, confirm: true }), /management access/);
  } finally { db.close(); }
});
