import assert from 'node:assert/strict';
import test from 'node:test';
import { EventTestDb } from './event-test-db';
import { runVenueImageOperation } from '../src/venueImagesMcp';
import { eventOperationStatus } from '../src/eventOperationStore';
const identity = { userId: 'pidp-user', scopes: ['org:events.read', 'org:events.write'] };
const plan = { organizationId: 'org-one', venueId: 'hall', imageUrl: 'https://hall.example/logo.png', imageSourceUrl: 'https://hall.example/', imageCredit: 'Hall — official logo' };
async function setup() {
  const db = new EventTestDb();
  await db.prepare("INSERT INTO organizations (id,name) VALUES ('org-other','Other')").run();
  await db.prepare("INSERT INTO venues (id,name,organization_id) VALUES ('hall','Hall','org-one'),('other','Other','org-other')").run();
  return { db, env: { DB: db } as unknown as Env };
}
test('venue images require scopes, live membership, exact ownership and strict public URLs', async () => {
  const { db, env } = await setup();
  try {
    await assert.rejects(runVenueImageOperation(env, { ...identity, scopes: [] }, plan), /scope/);
    await assert.rejects(runVenueImageOperation(env, { ...identity, userId: 'outsider' }, plan));
    await assert.rejects(runVenueImageOperation(env, identity, { ...plan, venueId: 'other' }), /not found/);
    for (const imageUrl of ['javascript:alert(1)', 'http://hall.example/logo', 'https://user:password@hall.example/logo']) await assert.rejects(runVenueImageOperation(env, identity, { ...plan, imageUrl }));
    await assert.rejects(runVenueImageOperation(env, identity, { ...plan, userId: 'owner' }));
    assert.equal((await db.prepare("SELECT image_url FROM venues WHERE id='hall'").first() as any).image_url, null);
  } finally { db.close(); }
});
test('venue images preserve edits, bind receipts, recheck permissions and cannot replay', async () => {
  const { db, env } = await setup();
  try {
    await assert.rejects(runVenueImageOperation(env, identity, { ...plan, confirm: true }), /preview first/);
    const preview = await runVenueImageOperation(env, identity, plan);
    const apply = { ...plan, confirm: true, previewId: preview.previewId };
    await assert.rejects(runVenueImageOperation(env, { ...identity, scopes: ['org:events.read'] }, apply), /scope/);
    await assert.rejects(runVenueImageOperation(env, identity, { ...apply, imageCredit: 'Different' }), /Preview/);
    await db.prepare("UPDATE venues SET image_credit='Intervening edit' WHERE id='hall'").run();
    await assert.rejects(runVenueImageOperation(env, identity, apply), /Preview/);
    const fresh = await runVenueImageOperation(env, identity, plan);
    await db.prepare("UPDATE organization_memberships SET status='inactive'").run();
    await assert.rejects(runVenueImageOperation(env, identity, { ...apply, previewId: fresh.previewId }));
    await db.prepare("UPDATE organization_memberships SET status='active'").run();
    const saved: any = await runVenueImageOperation(env, identity, { ...apply, previewId: fresh.previewId });
    assert.equal(saved.success, true);
    assert.equal(saved.venue.image_url, plan.imageUrl);
    assert.equal(saved.venue.image_source_url, plan.imageSourceUrl);
    assert.equal(saved.venue.image_credit, plan.imageCredit);
    assert.equal((await eventOperationStatus(env.DB, identity.userId, plan.organizationId, fresh.previewId!)).status, 'completed');
    await assert.rejects(runVenueImageOperation(env, identity, { ...apply, previewId: fresh.previewId }), /Preview/);
  } finally { db.close(); }
});
