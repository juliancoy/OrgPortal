import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TimebankDatabase } from './helpers/timebankDatabase'
import { localNewsletterRoutes } from '../src/localNewsletters'
import { newsletterId } from '../../shared/newsletterStorage'
import { mergeChanges } from '../../shared/ecosystemSync'

const document = { schemaVersion: 1, source: { publisher: 'BioBuzz', senderEmail: 'news@biobuzz.io', subject: 'Regional roundup', publishedDate: '2026-09-18' }, items: [{ key: 'one', title: 'Company hiring', kind: 'hiring' }] }
function setup() {
  const db = new TimebankDatabase()
  const batch = db.batch.bind(db)
  db.batch = statements => { assert.ok(statements.length, 'D1 rejects empty batches'); return batch(statements) }
  for (const name of ['0068_ecosystem_sync.sql', '0070_local_newsletters.sql', '0071_newsletter_source_archives.sql']) db.sqlite.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'))
  const env = { DB: db.asD1(), LOCAL_NEWSLETTER_WRITES: 'true', LOCAL_NEWSLETTER_TOKEN: 'local-test-capability', LOCAL_NEWSLETTER_DATASET: 'dataset-one' }
  const app = localNewsletterRoutes()
  const call = (path: string, body?: unknown, authorized = true) => app.request('https://localhost' + path, { method: body ? 'POST' : 'GET', headers: { ...(authorized ? { Authorization: 'Bearer local-test-capability' } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }, env)
  return { db, env, app, call }
}
test('imports require a local capability and matching receipt; repeated delivery is idempotent', async () => {
  const f = setup()
  try {
    assert.equal((await f.call('/status', undefined, false)).status, 401)
    assert.equal((await f.call('/sync', { datasetId: 'dataset-one', changes: [] })).status, 200)
    assert.equal((await f.app.request('https://localhost/status', {}, { DB: f.db.asD1() })).status, 404)
    assert.equal((await f.call('/import', { document, confirm: true })).status, 409)
    const preview = await (await f.call('/import', { document })).json() as any
    assert.equal(preview.items, 1)
    assert.equal((await f.call('/import', { document: { ...document, source: { ...document.source, subject: 'Different issue' } }, confirm: true, previewId: preview.previewId })).status, 409)
    const result = await (await f.call('/import', { document, confirm: true, previewId: preview.previewId })).json() as any
    assert.equal(result.imported, true)
    assert.equal((await (await f.call('/import', { document, confirm: true })).json() as any).alreadyImported, true)
    assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM ecosystem_sync_changes').get()!.n, 1)
    f.db.sqlite.exec("UPDATE local_newsletter_previews SET expires_at='2000-01-01'")
    assert.equal((await f.call('/import', { document: { ...document, items: [{ key: 'two', title: 'Correction', kind: 'news' }] }, confirm: true, previewId: preview.previewId })).status, 409)
  } finally { f.db.sqlite.close() }
})
test('browser changes converge with SQLite, reject other datasets and preserve immutable history', async () => {
  const f = setup()
  try {
    const recordId = await newsletterId(document as any)
    const change = { id: 'browser-one', entity: 'newsletter', recordId, replicaId: 'browser', counter: 1, deleted: false, value: document }
    assert.equal((await f.call('/sync', { datasetId: 'other', changes: [change] })).status, 409)
    const reply = await (await f.call('/sync', { datasetId: 'dataset-one', changes: [change] })).json() as any
    assert.deepEqual(reply.acknowledged, ['browser-one'])
    assert.equal(reply.changes.length, 1)
    assert.equal((await f.call('/sync', { datasetId: 'dataset-one', changes: [{ ...change, id: 'valid-new', counter: 2 }, { ...change, value: { ...document, items: [] } }] })).status, 409)
    assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM ecosystem_sync_changes').get()!.n, 1)
    assert.equal((await f.call('/sync', { datasetId: 'dataset-one', changes: [{ ...change, entity: 'funding' }] })).status, 400)
    await f.call('/sync', { datasetId: 'dataset-one', changes: [{ ...change, id: 'delete', counter: 2, deleted: true, value: null }] })
    const backup = await (await f.call('/export')).json() as any
    assert.equal(backup.changes.length, 2)
    assert.equal(mergeChanges({},backup.changes)['newsletter:' + recordId].deleted, true)
  } finally { f.db.sqlite.close() }
})
test('migration preserves existing changes, pending queues and feed sequence numbers', () => {
  const db = new TimebankDatabase()
  try {
    db.sqlite.exec(readFileSync(new URL('../migrations/0068_ecosystem_sync.sql', import.meta.url), 'utf8'))
    db.sqlite.exec("INSERT INTO ecosystem_sync_changes VALUES(42,'old','funding','round','browser',3,0,'{}',1)")
    db.sqlite.exec(readFileSync(new URL('../migrations/0070_local_newsletters.sql', import.meta.url), 'utf8'))
    const row = db.sqlite.prepare('SELECT * FROM ecosystem_sync_changes').get()!
    assert.equal(row.sequence, 42); assert.equal(row.pending, 1); assert.equal(row.id, 'old')
    assert.throws(() => db.sqlite.exec("UPDATE ecosystem_sync_changes SET value_json='{\"different\":true}' WHERE id='old'"))
    db.sqlite.exec("INSERT INTO ecosystem_sync_changes(id,entity,record_id,replica_id,counter,deleted,value_json) VALUES('new','newsletter','issue','local',4,0,'{}')")
    assert.ok(Number(db.sqlite.prepare("SELECT sequence FROM ecosystem_sync_changes WHERE id='new'").get()!.sequence) > 42)
  } finally { db.sqlite.close() }
})
