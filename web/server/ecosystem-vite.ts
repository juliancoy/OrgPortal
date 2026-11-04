import type { Plugin, ViteDevServer, PreviewServer } from 'vite'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { execFile } from 'node:child_process'
import { ecosystemResponse } from './ecosystem-query.mjs'
import {createArtifactBuffer} from './ecosystem-artifact-buffer.mjs'
export function ecosystemApi(): Plugin {
 let root = ''
 const attach = (server: ViteDevServer | PreviewServer) => {
  const folder=resolve(root,'public/ecosystem-data/query')
  const readArtifact=createArtifactBuffer(async(key:string)=>{const path=resolve(folder,key);if(!path.startsWith(folder+sep))throw Error('Invalid artifact path');return readFile(path,'utf8')})
  server.middlewares.use('/api/ecosystem', (req, res, next) => {
   if (!req.url) return next()
   const request = new Request(`http://localhost/api/ecosystem${req.url}`, { method: req.method })
   void ecosystemResponse(request,readArtifact).then(async response => {
    res.statusCode = response.status
    response.headers.forEach((value, name) => res.setHeader(name, value))
    if (response.status === 503) res.setHeader('Retry-After', '3')
    res.end(await response.text())
   }).catch(next)
  })
 }
 return {
  name: 'ecosystem-api',
  configResolved(config) { root = config.root },
  configureServer(server) {
   attach(server)
   // An expensive data refresh must not keep the entire portal's HTTP port
   // closed. The last atomically published dataset remains usable throughout.
   let closing = false
   const child = execFile(process.execPath, [resolve(root, 'scripts/build-ecosystem-query.mjs')], { cwd: root }, error => {
    if (!error || closing) return
    server.config.logger.error(`Ecosystem query refresh failed: ${error.message}`)
   })
   server.httpServer?.once('close', () => { closing = true; child.kill() })
  },
  configurePreviewServer: attach,
 }
}
