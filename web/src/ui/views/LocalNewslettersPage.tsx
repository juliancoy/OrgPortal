import { useState } from 'react'
import { connectNewsletterStorage, exportNewsletters, newsletterDocuments, stageNewsletter, syncNewsletters, restoreNewsletters } from '../../data/ecosystemSync/newsletters'
import type { NewsletterDocument } from '../../../../shared/newsletterStorage'

export function LocalNewslettersPage() {
  const [token, setToken] = useState(''), [dataset, setDataset] = useState(() => { try { return localStorage.getItem('orgportal.newsletterDataset') || '' } catch { return '' } })
  const [documents, setDocuments] = useState<Array<{ id: string; document: NewsletterDocument }>>([])
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false)
  async function perform(action: () => Promise<void>) {
    setBusy(true)
    try { await action() } catch (error) { setStatus(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  async function refresh(id = dataset) { setDocuments(await newsletterDocuments(id)) }
  return <section className="panel">
    <h1>Local newsletters</h1>
    <p>Import newsletters, keep them available offline, and sync them with this local deployment. Imports remain local until separately reviewed for publication.</p>
    <label>Local import credential <input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} /></label>
    <button disabled={busy || !token} onClick={() => void perform(async () => {
      const id = await connectNewsletterStorage(token); setDataset(id); localStorage.setItem('orgportal.newsletterDataset', id)
      await syncNewsletters(id, token); await refresh(id); setStatus('Connected and synchronized.')
    })}>Connect</button>
    {dataset && <>
      <label>Import newsletter JSON <input type="file" accept="application/json,.json" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; if (!file) return
        void perform(async () => { if (file.size > 100000) throw Error('Newsletter file is too large'); await stageNewsletter(dataset, JSON.parse(await file.text())); await refresh(); setStatus('Saved offline. Ready to sync.') })
      }} /></label>
      <button disabled={busy || !token} onClick={() => void perform(async () => { await syncNewsletters(dataset, token); await refresh(); setStatus('Synchronized.') })}>Sync</button>
      <button disabled={busy} onClick={() => void perform(async () => { await refresh(); setStatus('Loaded offline newsletters.') })}>Read offline</button>
      <button disabled={busy} onClick={() => void perform(async () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(await exportNewsletters(dataset), null, 2)], { type: 'application/json' }))
        const link = document.createElement('a'); link.href = url; link.download = `newsletters-${dataset}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      })}>Export backup</button>
      <label>Restore browser backup <input type="file" accept="application/json,.json" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; if (!file) return
        void perform(async () => { if (file.size > 10 * 1024 * 1024) throw Error('Backup is too large'); await restoreNewsletters(dataset, JSON.parse(await file.text())); await refresh(); setStatus('Backup restored, including pending edits.') })
      }} /></label>
    </>}
    <p role="status">{status}</p>
    {documents.map(({ id, document }) => <article key={id}>
      <h2>{document.source.subject}</h2><p>{document.source.publisher} · {document.source.publishedDate} · {document.items.length} items</p>
      {typeof document.source.bodyText === 'string' && <details><summary>Full newsletter text</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{document.source.bodyText}</pre></details>}
      <ul>{document.items.map(item => <li key={item.key}>{item.title}</li>)}</ul>
    </article>)}
  </section>
}
