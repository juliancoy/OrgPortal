import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const base = (process.env.ORGPORTAL_LOCAL_BASE || 'https://localhost:8443').replace(/\/$/, '')
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Local browser test only')
const output = new URL('../../.local/', import.meta.url)
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const receipt = { checks: [], errors: [] }
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', error => receipt.errors.push(error.message))
  const requests = []
  page.on('request', request => requests.push(new URL(request.url()).pathname))
  await page.goto(base + '/ecosystem/network')
  await page.waitForFunction(() => document.querySelector('#network-source')?.textContent.startsWith('Checked '), null, { timeout: 30000 })
  assert.ok(!requests.some(path => path.endsWith('ecosystem-history.json')), 'Graph must not download full event history')
  assert.equal(await page.locator('#network-events,#network-table,dialog').count(), 0, 'Auxiliary content belongs in separate views')
  await page.waitForTimeout(200)
  const positions = () => page.locator('#network-labels button').evaluateAll(nodes => nodes.map(node => [node.style.left, node.style.top, node.hidden]))
  const before = await positions()
  const box = await page.locator('#network-canvas').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 250)
  await page.waitForTimeout(200)
  assert.notDeepEqual(await positions(), before, 'Wheel must zoom the graph')
  const dimensions = () => page.evaluate(() => ({ scrollY, height: innerHeight, scrollHeight: document.documentElement.scrollHeight, width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
  const assertViewport = async view => {
    const size = await dimensions()
    assert.equal(size.scrollY, 0, `${view}: document moved`)
    assert.ok(size.scrollHeight <= size.height + 1, `${view}: vertical document overflow`)
    assert.ok(size.scrollWidth <= size.width + 1, `${view}: horizontal document overflow`)
    receipt.checks.push({ view, dimensions: size })
  }
  await assertViewport('graph')
  for (const [view, label] of [['events', 'Events'], ['relationships', 'Relationships'], ['help', 'Sources & help']]) {
    await page.locator('.eco-network-heading').getByRole('link', { name: label, exact: true }).click()
    await page.waitForFunction(() => !document.querySelector('#network-canvas'))
    if (view !== 'help') await page.waitForFunction(() => document.querySelector('.eco-view-content')?.textContent.includes('Public evidence checked'), null, { timeout: 30000 })
    await assertViewport(view)
    if (view === 'events') {
      await page.locator('.eco-view-content').getByRole('searchbox').fill('Baltimore')
      await page.waitForSelector('#event-results li')
    }
  }
  await page.locator('.eco-network-heading').getByRole('link', { name: 'Graph', exact: true }).click()
  await page.waitForSelector('#network-labels button')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  await assertViewport('mobile graph')
  await page.screenshot({ path: new URL('network-workspace-mobile.png', output).pathname })
  assert.deepEqual(receipt.errors, [])
  writeFileSync(new URL('network-workspace-verification.json', output), JSON.stringify(receipt, null, 2) + '\n')
  console.log(JSON.stringify(receipt))
} finally {
  await browser.close()
}
