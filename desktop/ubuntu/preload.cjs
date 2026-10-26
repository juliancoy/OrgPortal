// This isolated preload exposes no Node or desktop API to the web page.
const { ipcRenderer } = require('electron')
const origins = process.argv.find(value => value.startsWith('--orgportal-origins='))?.slice('--orgportal-origins='.length).split(',') || []
if (origins.includes(location.origin)) {
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]')
    if (!link) return
    const destination = new URL(link.href, location.href)
    if (!origins.includes(destination.origin) || !/^\/(?:p\/)?users\/login\/?$/.test(destination.pathname)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    ipcRenderer.send('orgportal:browser-sign-in')
  }, true)
  const installMenu = () => {
    const header = document.querySelector('.site-header-inner, .portal-header-inner, .site-header')
    if (!header || header.querySelector('.desktop-app-menu')) return
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'desktop-app-menu'
    button.textContent = '⋮'
    button.setAttribute('aria-label', 'Open application menu')
    button.setAttribute('aria-haspopup', 'menu')
    button.title = 'Application menu (F10)'
    button.addEventListener('click', () => ipcRenderer.send('orgportal:app-menu'))
    header.append(button)
  }
  document.addEventListener('DOMContentLoaded', () => {
    installMenu()
    new MutationObserver(installMenu).observe(document.body, {childList:true, subtree:true})
  }, {once:true})
  ipcRenderer.on('orgportal:sign-in-status', (_event, waiting) => {
    document.querySelector('.desktop-sign-in-status')?.remove()
    if (!waiting) return
    const banner = document.createElement('aside')
    banner.className = 'desktop-sign-in-status'
    banner.setAttribute('aria-label', 'Browser sign-in')
    const message = document.createElement('span')
    message.setAttribute('role', 'status')
    message.textContent = 'Finish signing in in your browser. OrgPortal will bring you back here.'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = 'Cancel sign-in'
    cancel.addEventListener('click', () => ipcRenderer.send('orgportal:cancel-sign-in'))
    banner.append(message, cancel)
    document.body.append(banner)
  })
  try {
    if (!localStorage.getItem('lifetech.theme')) localStorage.setItem('lifetech.theme', 'system')
  } catch { /* Storage may be unavailable on a failed navigation. */ }
}
