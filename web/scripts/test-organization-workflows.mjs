import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from '@playwright/test'

// Isolated component harness: synthetic tokens and intercepted loopback API
// calls only. This neither logs in nor persists any account/browser session.
const root = dirname(dirname(fileURLToPath(import.meta.url)))
mkdirSync(join(root, '.local'), { recursive: true })
const directory = mkdtempSync(join(root, '.local/organization-workflow-'))
writeFileSync(join(directory, 'index.html'), `<!doctype html><html><head><title>Organization fixture</title></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>`)
writeFileSync(join(directory, 'entry.tsx'), `import {createRoot} from 'react-dom/client';
import {OrganizationRegistrationForm} from ${JSON.stringify(join(root, 'src/ui/components/OrganizationRegistrationForm'))};
import {OwnershipReleaseControl} from ${JSON.stringify(join(root, 'src/ui/components/OwnershipReleaseControl'))};
const saved=async()=>{document.documentElement.dataset.saved=String(Number(document.documentElement.dataset.saved||0)+1)};
createRoot(document.getElementById('root')).render(<><OrganizationRegistrationForm token="synthetic-fixture" onSaved={saved}/><OwnershipReleaseControl token="synthetic-fixture" organizationId="fixture-org" onSaved={saved}/></>);`)
const server = createServer((request, response) => {
  const entry = request.url === '/entry.js'
  if (!entry && request.url !== '/') { response.writeHead(404).end(); return }
  response.writeHead(200, { 'content-type': entry ? 'text/javascript' : 'text/html' })
  response.end(readFileSync(join(directory, entry ? 'entry.js' : 'index.html')))
})
let browser
try {
  await build({ entryPoints: [join(directory, 'entry.tsx')], outfile: join(directory, 'entry.js'), bundle: true, format: 'esm', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) })
  const page = await browser.newPage(), calls = []
  await page.route('**/api/org/api/network/**', async route => {
    const endpoint = new URL(route.request().url()).pathname
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null
    calls.push({ endpoint, body })
    if (endpoint.endsWith('/owned-organizations/apply')) return route.abort()
    if (endpoint.includes('/operations/')) return route.fulfill({ json: { status: 'completed' } })
    return route.fulfill({ json: endpoint.endsWith('/preview') ? { previewId: '00000000-0000-4000-8000-000000000001', organizationId: 'new:fixture', expiresAt: new Date(Date.now() + 600000).toISOString(), effects: { otherActiveMembershipCount: 0 } } : { organizationId: 'fixture' } })
  })
  await page.goto(`${base}/`)
  await page.getByLabel('Name', { exact: true }).fill('Third Party')
  await page.getByLabel('Public evidence URL').fill('https://example.test/about')
  await page.getByLabel('Public description').fill('Public information.')
  await page.getByRole('button', { name: 'Review changes' }).click()
  await page.getByRole('button', { name: 'Publish directory listing' }).waitFor()
  assert.equal(calls.length, 1)
  assert.ok(calls[0].endpoint.endsWith('/directory/registration/preview'))
  assert.equal(calls[0].body.acknowledgeOwnership, undefined)
  await page.getByRole('button', { name: 'Publish directory listing' }).click()
  await page.getByText('Public directory listing added.', { exact: false }).waitFor()
  await page.getByLabel('What do you need?').selectOption('owned')
  await page.getByLabel('Organization type', { exact: true }).selectOption('team')
  await page.getByLabel('Name', { exact: true }).fill('My Team')
  await page.getByLabel('Public description').fill('A team I manage.')
  await page.getByRole('button', { name: 'Review changes' }).click()
  assert.equal(calls.length, 2)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Review changes' }).click()
  await page.getByRole('button', { name: 'Create with owner access' }).waitFor()
  assert.equal(calls.at(-1).body.acknowledgeOwnership, true)
  assert.equal(calls.at(-1).body.kind, 'team')
  await page.getByRole('button', { name: 'Create with owner access' }).click()
  await page.getByRole('button', { name: 'Check operation result' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Create with owner access' }).isDisabled(), true)
  await page.getByRole('button', { name: 'Check operation result' }).click()
  await page.getByText('The record was saved.').waitFor()
  assert.equal(calls.filter(call => call.endpoint.endsWith('/owned-organizations/apply')).length, 1)
  await page.getByRole('button', { name: 'Correct mistaken ownership' }).click()
  await page.getByRole('button', { name: 'Remove my ownership and membership' }).waitFor()
  assert.equal(calls.at(-1).body.reason, 'incorrect_association')
  await page.getByRole('button', { name: 'Remove my ownership and membership' }).click()
  await page.getByRole('button', { name: 'Correct mistaken ownership' }).waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.dataset.saved), '3')
  console.log('PASS: directory default, team creation intent, reviewed effects, lost-response inspection without replay, and self-correction')
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
  rmSync(directory, { recursive: true, force: true })
}
