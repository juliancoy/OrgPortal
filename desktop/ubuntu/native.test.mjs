import assert from 'node:assert/strict'
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { _electron } from '@playwright/test'
import electron from 'electron'
import { electronEnvironment } from './runtime.mjs'

process.env.SITE_BRAND = 'lifetech'
process.env.LIFETECH_DESKTOP_DEV = '1'
const root = fileURLToPath(new URL('../../../BmoreMedTech/', import.meta.url))
process.chdir(root)
const output = fileURLToPath(new URL('../../../artifacts/lifetech-native', import.meta.url))
await mkdir(output, { recursive: true })
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } })
await server.listen()
const url = server.resolvedUrls.local[0]
const application = await _electron.launch({
  executablePath: process.env.ORGPORTAL_TEST_RUNTIME || electron,
  chromiumSandbox: true,
  args: ['--disable-gpu', '--ozone-platform=x11', process.env.ORGPORTAL_TEST_ENTRY || fileURLToPath(new URL('./main.cjs', import.meta.url)), '--dev', url],
  env: { ...electronEnvironment(), XDG_CONFIG_HOME: `${output}/test-profile`, WAYLAND_DISPLAY: '' },
})
try {
  const page = await application.firstWindow()
  page.setDefaultTimeout(15000)
  console.log('Opened', page.url())
  application.on('console', message => console.log('electron:', message.text()))
  page.on('pageerror', error => console.log('page:', error.message))
  await page.waitForFunction(() => document.documentElement.dataset.desktop === 'true')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.desktopApp), 'orgportal')
  assert.equal(await page.locator('#desktop-migration').count(), 0)
  const state = await application.evaluate(({ BrowserWindow, Menu, app }) => ({
    title: BrowserWindow.getAllWindows()[0].getTitle(),
    preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
    menu: Menu.getApplicationMenu().items.map(item => item.label),
    profile: app.getPath('userData'),
  }))
  await page.waitForTimeout(1000)
  const windowId = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readUInt32LE(0))
  const properties = execFileSync('xprop', ['-f', '_NET_WM_ICON', '32c', '-id', String(windowId), '_NET_WM_ICON', 'WM_CLASS', '_NET_WM_NAME'], { encoding: 'utf8' })
  await writeFile(`${output}/window-properties.log`, properties)
  assert.ok(properties.includes('orgportal-dev'))
  assert.match(properties, /_NET_WM_ICON\(CARDINAL\) = 256, 256,/)
  await writeFile(`${output}/window-properties.log`, properties)
  assert.equal(state.title, 'OrgPortal Development')
  assert.equal(state.preferences.sandbox, true)
  assert.equal(state.preferences.nodeIntegration, false)
  assert.ok(state.menu.includes('View'))
  assert.ok(state.profile.endsWith('orgportal-desktop-dev'))
  const icon = await fetch(new URL('/favicon.ico', url))
  assert.equal(icon.status, 200)
  assert.equal(icon.headers.get('content-type'), 'image/png')
  assert.deepEqual(Buffer.from(await icon.arrayBuffer()), await readFile(new URL('../../../BmoreMedTech/assets/images/lifetech-logo-v2.png', import.meta.url)))
  await page.getByRole('button', {name:'Open application menu',exact:true}).waitFor()
  const report = []
  for (const theme of ['light', 'dark']) {
    await application.evaluate(({ nativeTheme }, theme) => { nativeTheme.themeSource = theme }, theme)
    // Ubuntu can report a stale renderer preference; native appearance is authoritative.
    await page.emulateMedia({ colorScheme: theme === 'dark' ? 'light' : 'dark' })
    await page.evaluate(() => { localStorage.removeItem('lifetech.theme') })
    await page.reload()
    console.log('Theme after reload', theme, await page.evaluate(() => ({theme: document.documentElement.dataset.theme, saved: localStorage.getItem('lifetech.theme'), dark: matchMedia('(prefers-color-scheme: dark)').matches})))
    await page.waitForFunction(theme => document.documentElement.dataset.desktop === 'true' && document.documentElement.dataset.theme === theme, theme)
    for (const width of [1180, 680]) {
      await application.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 800), width)
      await page.screenshot({ path: `${output}/native-${width}-${theme}.png` })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      assert.equal(overflow, false)
      report.push({ theme, width, overflow })
    }
  }
  for (const theme of ['light', 'dark']) {
    await application.evaluate(({ nativeTheme }, theme) => { nativeTheme.themeSource = theme }, theme)
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme)
  }
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1180, 800))
  await page.getByRole('button', { name: 'Use light theme' }).click()
  await page.reload()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light' && document.documentElement.dataset.desktop === 'true')
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  await page.emulateMedia({forcedColors:'active', reducedMotion:'reduce'})
  await page.screenshot({path:`${output}/native-high-contrast.png`})
  await page.emulateMedia({forcedColors:'none', reducedMotion:'no-preference'})
  const fixture = new URL('../../../BmoreMedTech/ubuntu-native-reload-check.html', import.meta.url)
  try {
    await writeFile(fixture, '<html><body><h1>Before desktop edit</h1></body></html>')
    await page.goto(new URL('/ubuntu-native-reload-check.html', url).href)
    await page.waitForFunction(() => document.documentElement.dataset.desktop === 'true')
    await page.waitForTimeout(700)
    await writeFile(fixture, '<html><body><h1>After desktop edit</h1></body></html>')
    await page.getByRole('heading', { name: 'After desktop edit' }).waitFor()
    await page.waitForFunction(() => document.documentElement.dataset.desktop === 'true')
  } finally { await unlink(fixture) }
  await writeFile(`${output}/native-report.json`, JSON.stringify({ state, layouts: report, favicon: 'matches LifeTech', liveReload: 'passed' }, null, 2))
  console.log('PASS: native menus/title, sandbox, isolated profile, favicon, light/dark layouts, theme persistence and live reload')
} finally {
  await application.close()
  await server.close()
}
