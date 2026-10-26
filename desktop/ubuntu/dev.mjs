process.env.LIFETECH_DESKTOP_DEV = '1'
import { spawn } from 'node:child_process'
import { watch } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import electron from 'electron'

process.env.SITE_BRAND = 'lifetech'
const root = process.env.ORGPORTAL_SITE_ROOT || fileURLToPath(new URL('../../../BmoreMedTech/', import.meta.url))
process.chdir(root)
const port = Number(process.env.ORGPORTAL_DEV_PORT || 5173)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('ORGPORTAL_DEV_PORT must be an integer from 1 to 65535')
const server = await createServer({ root, server: { host: '127.0.0.1', port, strictPort: process.env.ORGPORTAL_DEV_PORT !== undefined } })
try { await server.listen() }
catch (error) { console.error(`OrgPortal development could not start: ${error.message}`); await server.close(); process.exit(1) }
const url = server.resolvedUrls.local[0]
console.log(`OrgPortal development: ${url}\nWebsite live reload and desktop auto-restart enabled. Press Ctrl+C to stop.`)
let child, childExited, stopping = false, restarting = false, timer
let revision = 0
async function launch() {
  const { electronEnvironment } = await import(`./runtime.mjs?revision=${revision++}`)
  const platformArgs = process.platform === 'linux' && !process.env.WAYLAND_DISPLAY ? ['--ozone-platform=x11'] : []
  child = spawn(electron, [...platformArgs, fileURLToPath(new URL('./main.cjs', import.meta.url)), '--dev', url], { stdio: 'inherit', env: electronEnvironment() })
  const launched = child
  childExited = new Promise(resolve => launched.once('close', resolve))
  launched.once('error', error => { console.error(error.message); stop(1) })
  launched.once('exit', code => { if (!stopping && !restarting) stop(code || 0) })
  console.log(`OrgPortal desktop started (PID ${child.pid}).`)
}
const files = new Set(['main.cjs', 'preload.cjs', 'browser-auth.cjs', 'desktop.css', 'runtime.mjs'])
let changed = false
async function restart() {
  if (stopping || restarting) return
  restarting = true
  try {
    do {
      changed = false
      console.log('Desktop code changed; restarting OrgPortal…')
      child.kill('SIGTERM')
      const force = setTimeout(() => child.kill('SIGKILL'), 5000)
      await childExited
      clearTimeout(force)
      if (!stopping) await launch()
    } while (changed && !stopping)
  } catch (error) { console.error(error); await stop(1) }
  finally { restarting = false }
}
const watcher = watch(fileURLToPath(new URL('./', import.meta.url)), (_event, filename) => {
  if (!files.has(String(filename)) || stopping) return
  changed = true
  clearTimeout(timer)
  timer = setTimeout(restart, 150)
})
async function stop(code) {
  if (stopping) return
  stopping = true
  clearTimeout(timer)
  watcher.close()
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM')
    const force = setTimeout(() => child.kill('SIGKILL'), 5000)
    await childExited
    clearTimeout(force)
  }
  await server.close()
  process.exit(code)
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
await launch()
