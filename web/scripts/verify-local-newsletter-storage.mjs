// Operational verification of user-authorized imports; creates no fixture data.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const deployment = JSON.parse(readFileSync(root + '.local/bmoremedtech-newsletter-storage.json', 'utf8'))
const output = root + '.local/newsletter-browser-verification'
mkdirSync(output, { recursive: true })
const browser = await chromium.launchPersistentContext(output + '/profile', { headless: true, executablePath: '/usr/bin/google-chrome', ignoreHTTPSErrors: true, args: ['--no-sandbox'] })
try {
  await browser.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  const page = await browser.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('https://localhost:8443/local/newsletters')
  await page.getByLabel('Local import credential').fill(deployment.token)
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  try { await page.getByRole('status').filter({ hasText: 'Connected and synchronized.' }).waitFor({ timeout: 30000 }) }
  catch (error) { console.error('Local newsletter page status:', await page.getByRole('status').allTextContents()); throw error }
  const result = await page.evaluate(async dataset => {
    const newsletters = await import('/src/data/ecosystemSync/newsletters.ts')
    const store = await import('/src/data/ecosystemSync/store.ts')
    const documents = await newsletters.newsletterDocuments(dataset)
    const issue = documents.find(row => row.document.source.publishedDate === '2026-09-18' && row.document.source.publisher === 'BioBuzz')
    if (!issue || !issue.document.items.some(item => item.title.includes('Georgiamune'))) throw Error('Missing imported newsletter or items')
    await newsletters.stageNewsletter(dataset, issue.document)
    if ((await store.pendingChanges(dataset)).length) throw Error('Identical issue unexpectedly created a pending duplicate')
    return { issues: documents.length, items: issue.document.items.length, backup: await newsletters.exportNewsletters(dataset) }
  }, deployment.datasetId)
  writeFileSync(output + '/indexeddb-backup.json', JSON.stringify(result.backup, null, 2), { mode: 0o600 })
  await browser.setOffline(true)
  await page.getByRole('button', { name: 'Read offline', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Loaded offline newsletters.' }).waitFor()
  await page.screenshot({ path: output + '/offline.png', fullPage: true })
  if (errors.length) throw Error(errors.join('\n'))
  const receipt = { datasetId: deployment.datasetId, issues: result.issues, items: result.items, indexedDbVersion: result.backup.versions.indexedDb, pending: result.backup.outbox.length, offlineRead: true, duplicateSuppression: true, browserErrors: errors }
  writeFileSync(output + '/receipt.json', JSON.stringify(receipt, null, 2), { mode: 0o600 })
  console.log(JSON.stringify(receipt))
} finally { await browser.close() }
