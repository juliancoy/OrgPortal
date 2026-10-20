// Exercise the actual CSS cascade in the running local app, without signing in.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const base = process.env.LOCAL_PORTAL_URL || 'https://localhost:8443'
assert.equal(new URL(base).hostname, 'localhost')
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome' })
const tokens = ['primary', 'primary-2', 'primary-bg', 'primary-hover', 'body-bg', 'header-bg', 'footer-bg', 'hero-bg', 'panel', 'panel-2', 'border', 'border-input', 'border-hover', 'text-primary', 'text-secondary', 'text-muted', 'btn-primary-bg', 'btn-primary-text', 'icon-stroke', 'focus-ring', 'surface', 'border-subtle', 'bg-surface', 'icon-tile-bg', 'color-cream-dark', 'color-sage', 'surface-solid', 'surface-soft', 'surface-softer', 'surface-strong', 'surface-input', 'surface-muted', 'selection-bg', 'selection-text', 'color-border', 'color-text-primary', 'color-text-secondary']
const luminance = rgb => rgb.slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true })
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.documentElement.dataset.portalProfile)
  const results = {}
  for (const brand of ['orgportal', 'code-collective', 'lifetech', 'baltimore-medtech', 'deism', 'default']) {
    results[brand] = {}
    for (const [mode, scheme] of [['light', 'dark'], ['dark', 'light'], ['system-light', 'light'], ['system-dark', 'dark']]) {
      await page.emulateMedia({ colorScheme: scheme })
      const result = await page.evaluate(({ brand, mode, tokens }) => {
        const root = document.documentElement
        if (brand === 'default') delete root.dataset.portalProfile
        else root.dataset.portalProfile = brand
        if (mode.startsWith('system')) delete root.dataset.theme
        else root.dataset.theme = mode
        if (brand !== 'default') {
          const rules = [...document.styleSheets].flatMap(sheet => {
            try { return [...sheet.cssRules] } catch { return [] }
          })
          const dark = mode === 'dark' || mode === 'system-dark'
          const rule = rules.find(rule => rule.selectorText?.includes(`data-portal-profile="${brand}"`) &&
            (dark ? rule.selectorText.includes('data-theme="dark"') : !rule.selectorText.includes('data-theme')))
          if (!rule || tokens.some(key => !rule.style.getPropertyValue(`--${key}`))) {
            throw new Error(`${brand}: incomplete explicit ${dark ? 'dark' : 'light'} palette`)
          }
        }
        const style = getComputedStyle(root)
        const values = Object.fromEntries(tokens.map(key => [key, style.getPropertyValue(`--${key}`).trim()]))
        const probe = document.createElement('span'); document.body.append(probe)
        const color = token => { probe.style.color = `var(--${token})`; return getComputedStyle(probe).color.match(/[\d.]+/g).map(Number) }
        const pairs = [['text-primary', 'body-bg'], ['text-secondary', 'panel'], ['text-muted', 'panel'], ['btn-primary-text', 'btn-primary-bg']].map(([fg, bg]) => ({ fg, bg, a: color(fg), b: color(bg) }))
        probe.remove()
        return { values, pairs }
      }, { brand, mode, tokens })
      for (const [key, value] of Object.entries(result.values)) assert.ok(value, `${brand}/${mode} missing ${key}`)
      for (const { fg, bg, a, b } of result.pairs) assert.ok(contrast(a, b) >= 4.5, `${brand}/${mode} ${fg}/${bg} contrast ${contrast(a, b).toFixed(2)}`)
      results[brand][mode] = result.values
    }
    assert.deepEqual(results[brand]['system-light'], results[brand].light)
    assert.deepEqual(results[brand]['system-dark'], results[brand].dark)
    console.log(`PASS ${brand}: light/dark, system preference, text and button contrast`)
  }
  assert.deepEqual(results.default, results.orgportal)
  assert.equal(results['code-collective'].dark.panel, '#002a61')
  assert.equal(results.orgportal.dark.panel, '#15372f')
} finally { await browser.close() }
