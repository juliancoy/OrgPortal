import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { timingSafeEqual } from 'node:crypto'
import { NEWSLETTER_STORAGE, validateNewsletter, newsletterId, contentHash, canonicalJson } from '../../shared/newsletterStorage'
import { validateChange, type EcosystemChange } from '../../shared/ecosystemSync'
import { receiveAuthorizedChanges } from './ecosystemSyncStore'

export type LocalNewsletterEnv = {
  DB: D1Database
  LOCAL_NEWSLETTER_WRITES?: string
  LOCAL_NEWSLETTER_TOKEN?: string
  LOCAL_NEWSLETTER_DATASET?: string
}

export function localNewsletterRoutes() {
  const routes = new Hono<{ Bindings: LocalNewsletterEnv }>()
  routes.use('*', bodyLimit({ maxSize: 1024 * 1024 }))
  routes.use('*', async (c, next) => {
    if (c.env.LOCAL_NEWSLETTER_WRITES !== 'true' || !c.env.LOCAL_NEWSLETTER_TOKEN || !c.env.LOCAL_NEWSLETTER_DATASET) return c.json({ detail: 'Local newsletter storage disabled' }, 404)
    const token = c.req.header('Authorization')?.replace(/^Bearer /, '') || ''
    const actual = new TextEncoder().encode(token), expected = new TextEncoder().encode(c.env.LOCAL_NEWSLETTER_TOKEN)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return c.json({ detail: 'Local import credential required' }, 401)
    c.header('Cache-Control', 'no-store')
    await next()
  })
  routes.get('/status', async c => {
    const count = await c.env.DB.prepare("SELECT COUNT(DISTINCT record_id) n FROM ecosystem_sync_changes WHERE entity='newsletter'").first<{ n: number }>()
    return c.json({ datasetId: c.env.LOCAL_NEWSLETTER_DATASET, versions: NEWSLETTER_STORAGE, issuesIncludingDeleted: count?.n || 0, writable: true, publication: 'local-only' })
  })
  routes.post('/import', async c => {
    const input = await c.req.json<{ document: unknown; sourceArchive?: Record<string, unknown>; confirm?: boolean; previewId?: string }>()
    let doc
    try { doc = validateNewsletter(input.document) } catch (error) { return c.json({ detail: String(error) }, 400) }
    const recordId = await newsletterId(doc), hash = await contentHash(doc), changeId = 'newsletter-import-' + hash
    const archive = input.sourceArchive
    if (archive && (typeof archive.id !== 'string' || archive.id !== doc.source.gmailMessageId || !archive.payload)) return c.json({ detail: 'Source archive does not match the Gmail message' }, 400)
    const archiveHash = archive ? await contentHash(archive) : null
    if (archiveHash && doc.source.sourceArchiveSha256 !== archiveHash) return c.json({ detail: 'Source archive hash mismatch' }, 400)
    const existing = await c.env.DB.prepare('SELECT change_id FROM local_newsletter_imports WHERE id=?').bind(hash).first<{ change_id: string }>()
    if (existing) return c.json({ alreadyImported: true, recordId, changeId: existing.change_id, items: doc.items.length })
    if (input.confirm !== true) {
      const previewId = crypto.randomUUID(), expiresAt = new Date(Date.now() + 600000).toISOString()
      await c.env.DB.prepare('INSERT INTO local_newsletter_previews(id,content_hash,expires_at) VALUES(?,?,?)').bind(previewId, hash, expiresAt).run()
      return c.json({ previewId, expiresAt, recordId, items: doc.items.length, document: doc, publication: 'local-only' })
    }
    const now = new Date().toISOString()
    const preview = await c.env.DB.prepare('SELECT id FROM local_newsletter_previews WHERE id=? AND content_hash=? AND expires_at>? AND applied_at IS NULL').bind(input.previewId || '', hash, now).first()
    if (!preview) return c.json({ detail: 'Matching unexpired preview required' }, 409)
    // Allocate the local clock and consume the receipt in the same atomic batch.
    // A UNIQUE receipt guard makes concurrent applications abort rather than overwrite.
    const statements = [
      c.env.DB.prepare('INSERT INTO local_newsletter_imports(id,document_json,content_hash,change_id,created_at) VALUES(?,?,?,?,?)').bind(hash, canonicalJson(doc), hash, changeId, now),
      c.env.DB.prepare("INSERT INTO ecosystem_sync_changes(id,entity,record_id,replica_id,counter,deleted,value_json,pending) SELECT ?,'newsletter',?,?,COALESCE(MAX(counter),0)+1,0,?,0 FROM ecosystem_sync_changes").bind(changeId, recordId, c.env.LOCAL_NEWSLETTER_DATASET, canonicalJson(doc)),
      c.env.DB.prepare('UPDATE local_newsletter_previews SET applied_at=? WHERE id=?').bind(now, input.previewId),
    ]
    if (archive && archiveHash) statements.push(c.env.DB.prepare('INSERT INTO newsletter_source_archives(id,gmail_message_id,record_id,source_json,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(archiveHash, archive.id, recordId, canonicalJson(archive), now))
    await c.env.DB.batch(statements)
    return c.json({ imported: true, recordId, changeId, items: doc.items.length, publication: 'local-only' })
  })
  routes.post('/sync', async c => {
    const input = await c.req.json<{ datasetId: string; changes: unknown[]; after?: number }>()
    if (input.datasetId !== c.env.LOCAL_NEWSLETTER_DATASET) return c.json({ detail: 'Dataset mismatch' }, 409)
    if (!Array.isArray(input.changes) || input.changes.length > 100 || !Number.isSafeInteger(input.after ?? 0) || (input.after ?? 0) < 0) return c.json({ detail: 'Invalid sync batch or cursor' }, 400)
    let changes: EcosystemChange[]
    try {
      changes = input.changes.map(validateChange)
      for (const change of changes) {
        if (change.entity !== 'newsletter' || !/^newsletter-[a-f0-9]{64}$/.test(change.recordId)) throw Error('Only newsletter changes are accepted')
        if (!change.deleted && await newsletterId(validateNewsletter(change.value)) !== change.recordId) throw Error('Newsletter identity mismatch')
      }
    } catch (error) { return c.json({ detail: String(error) }, 400) }
    try { await receiveAuthorizedChanges(c.env.DB, changes) } catch { return c.json({ detail: 'Conflicting change identity; batch rolled back' }, 409) }
    const page = await c.env.DB.prepare("SELECT * FROM ecosystem_sync_changes WHERE entity='newsletter' AND pending=0 AND sequence>? ORDER BY sequence LIMIT 100").bind(input.after || 0).all<{ sequence: number; id: string; entity: 'newsletter'; record_id: string; replica_id: string; counter: number; deleted: number; value_json: string }>()
    return c.json({ datasetId: input.datasetId, acknowledged: changes.map(change => change.id), changes: page.results.map(row => ({ id: row.id, entity: row.entity, recordId: row.record_id, replicaId: row.replica_id, counter: row.counter, deleted: !!row.deleted, value: JSON.parse(row.value_json) })), cursor: page.results.at(-1)?.sequence ?? (input.after || 0), hasMore: page.results.length === 100 })
  })
  routes.get('/export', async c => {
    const after = Number(c.req.query('after') || 0)
    if (!Number.isSafeInteger(after) || after < 0) return c.json({ detail: 'Invalid export cursor' }, 400)
    const rows = await c.env.DB.prepare("SELECT sequence,id,entity,record_id,replica_id,counter,deleted,value_json FROM ecosystem_sync_changes WHERE entity='newsletter' AND sequence>? ORDER BY sequence LIMIT 100").bind(after).all<{ sequence: number; id: string; entity: 'newsletter'; record_id: string; replica_id: string; counter: number; deleted: number; value_json: string }>()
    return c.json({ datasetId: c.env.LOCAL_NEWSLETTER_DATASET, versions: NEWSLETTER_STORAGE, changes: rows.results.map(row => ({ id: row.id, entity: row.entity, recordId: row.record_id, replicaId: row.replica_id, counter: row.counter, deleted: !!row.deleted, value: JSON.parse(row.value_json) })), cursor: rows.results.at(-1)?.sequence ?? after, hasMore: rows.results.length === 100 })
  })
  return routes
}
