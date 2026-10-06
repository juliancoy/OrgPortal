import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { readFileSync } from 'node:fs'
import { TimebankDatabase } from '../../../../org-worker/test/helpers/timebankDatabase'
import { localNewsletterRoutes } from '../../../../org-worker/src/localNewsletters'
import { connectNewsletterStorage, stageNewsletter, syncNewsletters, newsletterDocuments, exportNewsletters, restoreNewsletters } from './newsletters'
import { pendingChanges } from './store'

const document = { schemaVersion: 1, source: { publisher: 'BioBuzz', senderEmail: 'news@biobuzz.io', subject: 'Roundup', publishedDate: '2026-09-18' }, items: [{ key: 'one', title: 'Company hiring', kind: 'hiring' }] }
let db: TimebankDatabase
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  db = new TimebankDatabase()
  for (const name of ['0068_ecosystem_sync.sql', '0070_local_newsletters.sql', '0071_newsletter_source_archives.sql']) db.sqlite.exec(readFileSync(new URL('../../../../org-worker/migrations/' + name, import.meta.url), 'utf8'))
  const app = localNewsletterRoutes()
  const env = { DB: db.asD1(), LOCAL_NEWSLETTER_WRITES: 'true', LOCAL_NEWSLETTER_TOKEN: 'local-test', LOCAL_NEWSLETTER_DATASET: 'test-dataset' }
  vi.stubGlobal('fetch', (url: string, options: RequestInit) => app.request('https://localhost' + url.replace('/api/org/api/local/newsletters', ''), options, env))
})
afterEach(() => { db.sqlite.close(); vi.unstubAllGlobals() })
it('browser offline edits commit to D1-compatible SQLite and a second browser converges', async () => {
  const dataset = await connectNewsletterStorage('local-test')
  await stageNewsletter(dataset, document)
  expect(await pendingChanges(dataset)).toHaveLength(1)
  await syncNewsletters(dataset, 'local-test')
  expect(await pendingChanges(dataset)).toHaveLength(0)
  expect(db.sqlite.prepare("SELECT COUNT(*) n FROM ecosystem_sync_changes WHERE entity='newsletter'").get()!.n).toBe(1)
  const first = await newsletterDocuments(dataset)
  vi.stubGlobal('indexedDB', new IDBFactory())
  await syncNewsletters(dataset, 'local-test')
  expect(await newsletterDocuments(dataset)).toEqual(first)
  await stageNewsletter(dataset, document)
  expect(await pendingChanges(dataset)).toHaveLength(0)
})
it('network/auth failures retain the queue and browser backups restore pending changes', async () => {
  await stageNewsletter('test-dataset', document)
  await expect(syncNewsletters('test-dataset', 'wrong-token')).rejects.toThrow('401')
  expect(await pendingChanges('test-dataset')).toHaveLength(1)
  const backup = await exportNewsletters('test-dataset')
  vi.stubGlobal('indexedDB', new IDBFactory())
  await restoreNewsletters('test-dataset', backup)
  expect(await pendingChanges('test-dataset')).toHaveLength(1)
  await syncNewsletters('test-dataset', 'local-test')
  expect(await pendingChanges('test-dataset')).toHaveLength(0)
})
