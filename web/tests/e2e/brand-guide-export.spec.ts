import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

type DrawnText = { text: string; x: number; y: number; width: number; size: number; canvasWidth: number; canvasHeight: number }

async function fixture(page: Page, palette?: { label: string; value: string; description: string }[]) {
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.fillText
    const drawn: DrawnText[] = []
    Object.assign(window, { __brandGuideText: drawn })
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
      drawn.push({ text, x, y, width: this.measureText(text).width, size: parseFloat(this.font.match(/[\d.]+px/)?.[0] || '0'), canvasWidth: this.canvas.width, canvasHeight: this.canvas.height })
      return original.call(this, text, x, y, maxWidth)
    }
  })
  await page.route('**/pidp/**', route => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/org/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/portal/site') ? {
    id: 'life', slug: 'lifetech', hostname: 'lifetech.example', name: 'LifeTech',
    tagline: 'Health × Medicine × Biotech', profile: 'community', accent_color: '#155e59',
    features: ['directory', 'events', 'chat'], feature_config: palette ? { brandPalette: palette } : {},
  } : [] }))
  await page.goto('/branding')
}

async function exportedImage(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download style guide (PNG)' }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('lifetech-color-style-guide.png')
  expect(await download.failure()).toBeNull()
  const buffer = await readFile((await download.path())!)
  expect(buffer.subarray(1, 4).toString()).toBe('PNG')
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20)
  expect(width).toBe(1200)
  expect(height).toBeGreaterThanOrEqual(1800)
  const text = await page.evaluate(() => (window as unknown as { __brandGuideText: DrawnText[] }).__brandGuideText)
  expect(text.length).toBeGreaterThan(8)
  for (const line of text) {
    expect(line.x).toBeGreaterThanOrEqual(72)
    expect(line.x + line.width).toBeLessThanOrEqual(width - 71)
    expect(line.y + line.size).toBeLessThanOrEqual(height - 71)
  }
  await expect(page.getByRole('status').filter({ hasText: 'Style guide downloaded.' })).toBeVisible()
  return { buffer, text, height }
}

test('brand guide downloads a portrait PNG with exact palette RGB and full text', async ({ page }) => {
  await fixture(page)
  const { buffer, text } = await exportedImage(page)
  const content = text.map(line => line.text).join(' ')
  for (const value of ['LifeTech', 'Health × Medicine × Biotech', 'HealthTech Teal', '#155E59', 'MedTech OffWhite', '#F4F5F0', 'BioTech Gold', '#D4AF37', 'MRI machines.', '/branding']) expect(content).toContain(value)
  const pixels = await page.evaluate(async bytes => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0); bitmap.close()
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    const counts: Record<string, number> = { '21,94,89': 0, '244,245,240': 0, '212,175,55': 0 }
    let transparent = 0
    for (let i = 0; i < data.length; i += 4) {
      const key = `${data[i]},${data[i+1]},${data[i+2]}`
      if (key in counts) counts[key]++
      if (data[i+3] !== 255) transparent++
    }
    return { counts, transparent }
  }, Array.from(buffer))
  expect(pixels.transparent).toBe(0)
  for (const count of Object.values(pixels.counts)) expect(count).toBeGreaterThan(200000)
})

test('brand guide export fits long MCP labels and descriptions across twelve colors', async ({ page }) => {
  const palette = Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1} ${'LongUnbrokenLabel'.repeat(5)}`.slice(0, 80), value: '#123456', description: 'Detailed editable branding description. '.repeat(8).slice(0, 300) }))
  await fixture(page, palette)
  const { text, height } = await exportedImage(page)
  expect(height).toBeGreaterThan(5000)
  expect(text.filter(line => line.text === '#123456')).toHaveLength(12)
  expect(text.some(line => line.text.includes('Detailed editable'))).toBe(true)
  expect(text.at(-1)?.text).toContain('/branding')
})

test('failed PNG encoding reports an error and allows another export attempt', async ({ page }) => {
  await fixture(page)
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = function(callback) { callback(null) } })
  const button = page.getByRole('button', { name: 'Download style guide (PNG)' })
  await button.click()
  await expect(page.getByRole('status').filter({ hasText: 'Could not export the style guide. Please try again.' })).toBeVisible()
  await expect(button).toBeEnabled()
})
