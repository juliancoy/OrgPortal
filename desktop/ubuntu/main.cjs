const { browserAuth } = require('./browser-auth.cjs')
const { X509Certificate } = require('node:crypto')
const { app, BrowserWindow, Menu, ipcMain, nativeTheme, nativeImage, shell, dialog } = require('electron')
const { readFileSync, existsSync } = require('node:fs')
const path = require('node:path')

const entryIndex = process.argv.findIndex(value => path.resolve(value) === __filename)
const args = process.argv.slice(entryIndex + 1)
const development = args[0] === '--dev'
let target
try {
  if (args.length && !development || args.length > 2) throw Error('Usage: orgportal [--dev [URL]]')
  target = new URL(development ? args[1] || 'http://localhost:5173/' : 'https://lifetech.fyi/')
  if (!['http:', 'https:'].includes(target.protocol)) throw Error('Use an HTTP or HTTPS development URL')
} catch (error) { console.error(error.message); app.exit(2) }

const localOrigin = process.env.ORGPORTAL_LOCAL_ORIGIN || 'https://localhost:8770'
const trustedOrigins = new Set([target.origin])
if (development && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(localOrigin).hostname)) trustedOrigins.add(new URL(localOrigin).origin)
const certificatePins = new Map()
if (development) {
  for (const origin of trustedOrigins) {
    if (['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) certificatePins.set(origin, process.env.ORGPORTAL_DEV_CERT || path.join(process.cwd(), '.local/certs/localhost.crt'))
  }
  const identityOrigin = new URL(process.env.ORGPORTAL_IDENTITY_ORIGIN || 'https://id.localhost:8443')
  if (identityOrigin.protocol === 'https:' && ['id.localhost', 'localhost', '127.0.0.1', '[::1]'].includes(identityOrigin.hostname)) certificatePins.set(identityOrigin.origin, process.env.ORGPORTAL_IDENTITY_CERT || path.resolve(process.cwd(), '../OrgPortal/.local/certs/localhost.crt'))
}
app.on('certificate-error', (event, _contents, url, _error, certificate, callback) => {
  try {
    const pin = certificatePins.get(new URL(url).origin)
    if (pin && new X509Certificate(certificate.data).fingerprint256 === new X509Certificate(readFileSync(pin)).fingerprint256) { event.preventDefault(); callback(true); return }
  } catch {}
  callback(false)
})

app.setName(development ? 'OrgPortal Development' : 'OrgPortal')
app.setPath('userData', path.join(app.getPath('appData'), development ? 'orgportal-desktop-dev' : 'orgportal-desktop'))
app.setDesktopName(development ? 'orgportal-dev.desktop' : 'orgportal.desktop')
const css = readFileSync(path.join(__dirname, 'desktop.css'), 'utf8')
const iconPath = existsSync(path.join(__dirname, 'icon.png')) ? path.join(__dirname, 'icon.png') : path.join(__dirname, 'icon.png')
const icon = nativeImage.createFromPath(iconPath).resize({ width: 256, height: 256 })
if (icon.isEmpty()) throw new Error(`OrgPortal icon could not be loaded: ${iconPath}`)
const desktopSetup = () => `(() => {
  document.documentElement.dataset.desktop = 'true';
  document.documentElement.dataset.desktopApp = 'orgportal';
  window.lifeTechSystemDark = ${nativeTheme.shouldUseDarkColors};
  const followSystem = () => {
    const saved = localStorage.getItem('lifetech.theme');
    if (saved && saved !== 'system') return;
    const theme = window.lifeTechSystemDark ? 'dark' : 'light';
    if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
  };
  followSystem();
  window.lifeTechThemeObserver?.disconnect();
  window.lifeTechThemeObserver = new MutationObserver(followSystem);
  window.lifeTechThemeObserver.observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme', 'data-theme-mode']});
})()`
let window, pendingBrowserAuth
nativeTheme.on('updated', () => {
  if (!window || window.isDestroyed()) return
  const url = window.webContents.getURL()
  if (!url || !trustedOrigins.has(new URL(url).origin)) return
  window.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0b1417' : '#fafafa')
  window.webContents.executeJavaScript(desktopSetup()).catch(error => console.error('Desktop theme:', error.message))
})
const portalOrigin = development ? new URL(localOrigin).origin : target.origin
function authError(error) {
  window.setTitle(app.name)
  window.webContents.send('orgportal:sign-in-status', false)
  dialog.showMessageBox(window, {type:'error', title:'OrgPortal sign-in', message:error.message})
}
function trustedSender(event) {
  return window && !window.isDestroyed() && event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame && trustedOrigins.has(new URL(event.senderFrame.url).origin)
}
function cancelBrowserAuth() {
  pendingBrowserAuth?.cancel()
  pendingBrowserAuth = null
  window.setTitle(app.name)
  window.webContents.send('orgportal:sign-in-status', false)
}
function showAppMenu() {
  Menu.buildFromTemplate([
    {label:'Sign in Using Browser', click:startBrowserAuth},
    {label:'Cancel Browser Sign-in', enabled:!!pendingBrowserAuth, click:cancelBrowserAuth},
    {type:'separator'},
    {label:'Home', accelerator:'Alt+Home', click:()=>window.loadURL(target.href)},
    {role:'reload'},
    {label:'Open in Browser', click:()=>shell.openExternal(window.webContents.getURL())},
    {type:'separator'}, {role:'quit'},
  ]).popup({window})
}
ipcMain.on('orgportal:app-menu', event => { if (trustedSender(event)) showAppMenu() })
ipcMain.on('orgportal:cancel-sign-in', event => { if (trustedSender(event)) cancelBrowserAuth() })
ipcMain.on('orgportal:browser-sign-in', event => {
  if (!trustedSender(event)) return
  startBrowserAuth()
})
async function startBrowserAuth() {
  if (pendingBrowserAuth) return
  const attempt = {cancel() {}}
  pendingBrowserAuth = attempt
  window.setTitle(`${app.name} — waiting for browser sign-in`)
  window.webContents.send('orgportal:sign-in-status', true)
  try {
    const handle = await browserAuth({session:window.webContents.session,portalOrigin,issuer:development ? process.env.ORGPORTAL_IDENTITY_ORIGIN || 'https://id.localhost:8443' : 'https://orgportal.cc/pidp',
      openExternal:url=>shell.openExternal(url),
      onComplete:async url=>{pendingBrowserAuth=null;await window.loadURL(url);window.setTitle(app.name);window.show();window.focus()},
      onError:error=>{pendingBrowserAuth=null;authError(error)},
    })
    if (pendingBrowserAuth === attempt) Object.assign(attempt, handle)
    else handle.cancel()
  } catch(error) {pendingBrowserAuth=null;authError(error)}
}
async function createWindow() {
  window = new BrowserWindow({
    width: 1180, height: 800, minWidth: 640, minHeight: 480,
    title: app.name, icon, show: false, autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b1417' : '#fafafa',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs'), additionalArguments: [`--orgportal-origins=${[...trustedOrigins].join(",")}`] },
  })
  window.on('closed', () => { pendingBrowserAuth?.cancel(); pendingBrowserAuth=null })
  window.on('page-title-updated', event => { event.preventDefault(); window.setTitle(app.name) })
  window.once('ready-to-show', () => { window.setIcon(icon); window.show() })
  window.webContents.on('did-finish-load', async () => {
    // Only customize LifeTech, never identity-provider or external pages.
    if (!trustedOrigins.has(new URL(window.webContents.getURL()).origin)) return
    try {
      await window.webContents.insertCSS(css)
      await window.webContents.executeJavaScript(desktopSetup())
    } catch (error) { console.error('Desktop styling:', error.message) }
  })
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F10') {event.preventDefault();showAppMenu()}
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const destination = new URL(url)
    if (trustedOrigins.has(destination.origin) && destination.pathname === '/users/login') {event.preventDefault();startBrowserAuth();return}
    if (!['http:', 'https:'].includes(new URL(url).protocol)) event.preventDefault()
  })
  window.webContents.on('did-fail-load', (_event, code, message, _url, mainFrame) => {
    if (!mainFrame || code === -3) return
    window.show()
    dialog.showMessageBox(window, { type: 'error', title: 'OrgPortal', message: 'OrgPortal could not connect', detail: `${message}\n${target.href}`, buttons: ['OK'] })
  })
  await window.loadURL(target.href).catch(error => console.error(error.message))
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'OrgPortal', submenu: [
      { label: 'Sign in Using Browser', click: startBrowserAuth },
      { label: 'Sign in Here', click: () => {pendingBrowserAuth?.cancel();pendingBrowserAuth=null;window.setTitle(app.name);window.loadURL(new URL('/users/login', portalOrigin).href)} },
      { label: 'Cancel Browser Sign-in', click: cancelBrowserAuth },
      { type: 'separator' },
      { label: 'Home', accelerator: 'Alt+Home', click: () => window.loadURL(target.href) },
      { label: 'Open in Browser', click: () => shell.openExternal(target.href) },
      { type: 'separator' }, { role: 'quit' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }, ...(development ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : [])] },
    { label: 'Go', submenu: [
      { label: 'Back', accelerator: 'Alt+Left', click: () => { if (window.webContents.navigationHistory.canGoBack()) window.webContents.navigationHistory.goBack() } },
      { label: 'Forward', accelerator: 'Alt+Right', click: () => { if (window.webContents.navigationHistory.canGoForward()) window.webContents.navigationHistory.goForward() } },
    ] },
  ]))
  createWindow()
})
app.on('window-all-closed', () => app.quit())
