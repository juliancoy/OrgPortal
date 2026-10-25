import type { Plugin, ViteDevServer, PreviewServer } from 'vite'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ecosystemResponse } from './ecosystem-query.mjs'
export function ecosystemApi(): Plugin {
 let root = ''
 const attach = (server: ViteDevServer | PreviewServer) => {
  server.middlewares.use('/api/ecosystem', (req, res, next) => {
   if (!req.url) return next()
   const request = new Request(`http://localhost/api/ecosystem${req.url}`, { method: req.method })
   const folder = resolve(root, 'public/ecosystem-data/query')
   void ecosystemResponse(request, async key => {
    const path = resolve(folder, key)
    if (!path.startsWith(folder + sep)) throw Error('Invalid artifact path')
    return JSON.parse(await readFile(path, 'utf8'))
   }).then(async response => {
    res.statusCode = response.status
    response.headers.forEach((value, name) => res.setHeader(name, value))
    res.end(await response.text())
   }).catch(next)
  })
 }
 return {
  name: 'ecosystem-api',
  configResolved(config) { root = config.root },
  async configureServer(server) {
   await promisify(execFile)(process.execPath, [resolve(root, 'scripts/build-ecosystem-query.mjs')], { cwd: root })
   attach(server)
  },
  configurePreviewServer: attach,
 }
}
