import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { newsletterSyncRoutes } from '../src/newsletterSync'
import { EventIntegrationError } from '../src/eventPlatforms'
import { TimebankDatabase } from './helpers/timebankDatabase'
import { contentHash, newsletterId } from '../../shared/newsletterStorage'
import { compareHistory, collectFeed, syncNewsletterHistory } from '../scripts/newsletter-sync.mjs'
import { localNewsletterRoutes } from '../src/localNewsletters'

const resource = 'https://lifetech.fyi/api/org/mcp'
const document = { schemaVersion: 1 as const, source: { publisher: 'BioBuzz', senderEmail: 'news@biobuzz.io', subject: 'Roundup', publishedDate: '2026-09-18' }, items: [{ key: 'funding', kind: 'news', title: 'Georgiamune funding' }] }
async function fixture() {
  const db = new TimebankDatabase()
  for (const migration of ['0017_event_mcp_operations.sql', '0072_private_newsletter_sync.sql']) db.sqlite.exec(readFileSync(new URL('../migrations/' + migration, import.meta.url), 'utf8'))
  const app = newsletterSyncRoutes(async request => {
    const owner = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!owner) throw new EventIntegrationError(401, 'Invalid or unauthorized access token')
    return { userId: owner, resource: request.headers.get('X-Test-Resource') || resource,
      scopes: request.headers.get('X-Test-Read-Only') ? ['org:portal.read'] : ['org:portal.read', 'org:portal.write'] }
  })
  // Routes are directly mounted in this fixture.
  const request = (path: string, body?: unknown, owner = 'account-one', extra = {}) => app.request('https://worker' + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { ...(owner ? { Authorization: 'Bearer ' + owner } : {}), 'Content-Type': 'application/json', ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, { DB: db } as unknown as Env)
  const change = { id: 'import-1', entity: 'newsletter', recordId: await newsletterId(document), replicaId: 'local-one', counter: 1, deleted: false, value: document }
  return { db, request, change }
}

test('private newsletters require account scopes and isolate each account and portal', async () => {
  const f = await fixture()
  try {
    assert.equal((await f.request('/status', undefined, '')).status, 401)
    assert.equal((await f.request('/preview', { changes: [f.change], archives: [] }, 'account-one', { 'X-Test-Read-Only': 'true' })).status, 403)
    const payload = { changes: [f.change], archives: [] }
    const preview = await (await f.request('/preview', payload)).json() as { previewId: string }
    assert.equal((await f.request('/apply', { ...payload, previewId: preview.previewId }, 'account-two')).status, 409)
    assert.equal((await f.request('/apply', { ...payload, previewId: preview.previewId })).status, 200)
    assert.equal((await (await f.request('/changes')).json() as any).changes.length, 1)
    assert.equal((await (await f.request('/changes', undefined, 'account-two')).json() as any).changes.length, 0)
    assert.equal((await (await f.request('/changes', undefined, 'account-one', { 'X-Test-Resource': 'https://medtech.social/api/org/mcp' })).json() as any).changes.length, 0)
    assert.equal((await f.request('/status')).headers.get('Cache-Control'), 'no-store')
  } finally { f.db.sqlite.close() }
})

test('receipts bind exact content; retry is inert and conflicting change batches roll back', async () => {
  const f = await fixture()
  try {
    const payload = { changes: [f.change], archives: [] }
    const apply = async (body: any) => {
      const preview = await (await f.request('/preview', body)).json() as any
      return f.request('/apply', { ...body, previewId: preview.previewId })
    }
    const preview = await (await f.request('/preview', payload)).json() as any
    assert.equal((await f.request('/apply', { changes: [], archives: [], previewId: preview.previewId })).status, 409)
    assert.equal((await f.request('/apply', { ...payload, previewId: preview.previewId })).status, 200)
    assert.equal((await f.request('/apply', { ...payload, previewId: preview.previewId })).status, 409)
    assert.equal((await apply(payload)).status, 200)
    const conflict = { ...f.change, value: { ...document, items: [] } }
    assert.equal((await apply({ changes: [{ ...f.change, id: 'new-valid', counter: 2 }, conflict], archives: [] })).status, 409)
    assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM private_newsletter_changes').get()!.n, 1)
    assert.equal((await f.request('/preview', { changes: [{ ...f.change, entity: 'organization' }], archives: [] })).status, 400)
    assert.equal((await f.request('/changes?after=-1')).status, 400)
  } finally { f.db.sqlite.close() }
})

test('full source archives remain private, verified by hash and atomically attached', async () => {
  const f = await fixture()
  try {
    const archive = { id: 'gmail-original', payload: { body: 'Complete original', headers: [{ name: 'From', value: 'news@biobuzz.io' }] } }
    const hash = await contentHash(archive)
    const change = { ...f.change, value: { ...document, source: { ...document.source, gmailMessageId: archive.id, sourceArchiveSha256: hash } } }
    const payload = { changes: [change], archives: [archive] }
    assert.equal((await f.request('/preview', { ...payload, archives: [{ ...archive, payload: { body: 'tampered' } }] })).status, 400)
    const preview = await (await f.request('/preview', payload)).json() as any
    assert.equal((await f.request('/apply', { ...payload, previewId: preview.previewId })).status, 200)
    assert.deepEqual(await (await f.request('/archives/' + hash)).json(), archive)
    assert.equal((await f.request('/archives/' + hash, undefined, 'account-two')).status, 404)
    assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM private_newsletter_archives').get()!.n, 1)
  } finally { f.db.sqlite.close() }
})

test('CLI history plans detect collisions and cannot loop on a nonadvancing feed', async () => {
  const f = await fixture()
  try {
    assert.deepEqual(compareHistory([f.change], []), { push: [f.change], pull: [] })
    assert.deepEqual(compareHistory([f.change], [f.change]), { push: [], pull: [] })
    assert.throws(() => compareHistory([f.change], [{ ...f.change, counter: 2 }]), /Conflicting/)
    await assert.rejects(collectFeed(async () => ({ changes: [], cursor: 0, hasMore: true }), '/changes'), /Invalid newsletter feed/)
    await assert.rejects(collectFeed(async () => ({ datasetId: 'wrong', changes: [], cursor: 0, hasMore: false }), '/export', 'expected'), /dataset mismatch/)
  } finally { f.db.sqlite.close() }
})

test('CLI sync preserves original MIME and converges local SQL with private remote edits', async () => {
  const remote = await fixture(), local = new TimebankDatabase(), root = mkdtempSync(join(tmpdir(), 'orgportal-newsletter-sync-'))
  try {
    for (const name of ['0068_ecosystem_sync.sql', '0070_local_newsletters.sql', '0071_newsletter_source_archives.sql']) local.sqlite.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'))
    const app = localNewsletterRoutes()
    const env = { DB: local, LOCAL_NEWSLETTER_WRITES: 'true', LOCAL_NEWSLETTER_TOKEN: 'local-test-only', LOCAL_NEWSLETTER_DATASET: 'local-dataset' } as unknown as Env
    const callLocal = async (path: string, body?: unknown) => {
      const response = await app.request('https://local' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer local-test-only', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, env)
      assert.equal(response.status, 200, await response.clone().text())
      return response.json()
    }
    const callRemote = async (path: string, body?: unknown) => {
      const response = await remote.request(path, body)
      assert.equal(response.status, 200, await response.clone().text())
      return response.json()
    }
    const archive = { id: 'message-original', payload: { parts: [{ mimeType: 'text/html', body: '<a href="https://biobuzz.io/">BioBuzz</a>' }] } }
    const hash = await contentHash(archive)
    const doc = { ...document, source: { ...document.source, sourceArchiveSha256: hash, gmailMessageId: archive.id } }
    const preview = await callLocal('/import', { document: doc, sourceArchive: archive }) as any
    await callLocal('/import', { document: doc, sourceArchive: archive, confirm: true, previewId: preview.previewId })
    const args = { command: { resource, dryRun: false }, config: { datasetId: 'local-dataset' }, callLocal, callRemote, root, log: () => {} }
    await syncNewsletterHistory(args)
    assert.equal(remote.db.sqlite.prepare('SELECT COUNT(*) n FROM private_newsletter_changes').get()!.n, 1)
    assert.equal(remote.db.sqlite.prepare('SELECT COUNT(*) n FROM private_newsletter_archives').get()!.n, 1)
    const before = remote.db.sqlite.prepare('SELECT COUNT(*) n FROM private_newsletter_previews').get()!.n
    await syncNewsletterHistory({ ...args, command: { resource, dryRun: true } })
    assert.equal(remote.db.sqlite.prepare('SELECT COUNT(*) n FROM private_newsletter_previews').get()!.n, before)
    const changes = await collectFeed(callRemote, '/changes')
    const update = { ...changes[0], id: 'remote-edit', replicaId: 'another-device', counter: 2, value: { ...doc, items: [{ ...doc.items[0], title: 'Updated source annotation' }] } }
    const updatePayload = { changes: [update], archives: [] }
    const p = await callRemote('/preview', updatePayload) as any
    await callRemote('/apply', { ...updatePayload, previewId: p.previewId })
    await syncNewsletterHistory(args)
    assert.equal((await collectFeed(callLocal, '/export', 'local-dataset')).length, 2)
    assert.deepEqual(await callLocal('/archives/' + hash), archive)
    assert.equal(remote.db.sqlite.prepare('SELECT COUNT(*) n FROM private_newsletter_changes').get()!.n, 2)
    assert.deepEqual(compareHistory(await collectFeed(callLocal, '/export', 'local-dataset'), await collectFeed(callRemote, '/changes')), { push: [], pull: [] })
  } finally { remote.db.sqlite.close(); local.sqlite.close(); rmSync(root, { recursive: true, force: true }) }
})
