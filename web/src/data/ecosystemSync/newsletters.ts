import { exchangeChanges, queueChange, readSyncState, exportSyncStorage, restoreSyncStorage, type SyncBackup } from './store'
import { NEWSLETTER_STORAGE, newsletterId, validateNewsletter, canonicalJson } from '../../../../shared/newsletterStorage'
import type { EcosystemChange } from './protocol'

const base = '/api/org/api/local/newsletters'
function headers(token: string) { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
async function jsonResponse(response: Response) {
  if (!response.ok) throw Error(`Local newsletter storage returned ${response.status}`)
  return response.json()
}
export async function connectNewsletterStorage(token: string): Promise<string> {
  const status = await jsonResponse(await fetch(base + '/status', { headers: headers(token), cache: 'no-store', credentials: 'omit' }))
  if (status.versions?.protocol !== NEWSLETTER_STORAGE.protocol || typeof status.datasetId !== 'string') throw Error('Incompatible newsletter deployment')
  return status.datasetId
}
export async function stageNewsletter(datasetId: string, value: unknown) {
  const doc = validateNewsletter(value), recordId = await newsletterId(doc)
  const existing = (await readSyncState(datasetId))['newsletter:' + recordId]
  if (existing && !existing.deleted && canonicalJson(existing.value) === canonicalJson(doc)) return existing
  return queueChange('newsletter', recordId, doc as unknown as Record<string, unknown>, datasetId)
}
export async function syncNewsletters(datasetId: string, token: string) {
  // Replay the feed from zero on each exchange: durable change IDs make retries
  // inert and a crash cannot leave a separately persisted cursor ahead of data.
  await exchangeChanges(async (pending: EcosystemChange[]) => {
    const accepted: string[] = [], changes: unknown[] = []
    for (let start = 0; start < Math.max(pending.length, 1); start += 100) {
      const chunk = pending.slice(start, start + 100)
      let after = 0, hasMore = true
      while (hasMore) {
        const reply = await jsonResponse(await fetch(base + '/sync', { method: 'POST', headers: headers(token), credentials: 'omit', body: JSON.stringify({ datasetId, changes: after === 0 ? chunk : [], after }) }))
        if (reply.datasetId !== datasetId || !Array.isArray(reply.changes) || !Array.isArray(reply.acknowledged) || !Number.isSafeInteger(reply.cursor) || reply.cursor < after || typeof reply.hasMore !== 'boolean' || (reply.hasMore && reply.cursor <= after)) throw Error('Invalid newsletter sync reply')
        accepted.push(...reply.acknowledged); changes.push(...reply.changes)
        after = reply.cursor; hasMore = reply.hasMore
      }
    }
    return { changes, acknowledged: [...new Set(accepted)] }
  }, datasetId)
}
export async function newsletterDocuments(datasetId: string) {
  return Object.values(await readSyncState(datasetId)).filter(change => change.entity === 'newsletter' && !change.deleted).map(change => ({ id: change.recordId, document: validateNewsletter(change.value) }))
}
export async function exportNewsletters(datasetId: string) {
  return { versions: NEWSLETTER_STORAGE, ...await exportSyncStorage(datasetId) }
}
export async function restoreNewsletters(datasetId: string, backup: SyncBackup & { versions: typeof NEWSLETTER_STORAGE }) {
  if (backup.versions?.protocol !== NEWSLETTER_STORAGE.protocol) throw Error('Incompatible backup protocol')
  for (const change of [...backup.changes, ...backup.outbox]) {
    if (change.entity !== 'newsletter') throw Error('Backup contains a different record domain')
    if (!change.deleted && await newsletterId(validateNewsletter(change.value)) !== change.recordId) throw Error('Backup newsletter identity mismatch')
  }
  await restoreSyncStorage(datasetId, backup)
}
