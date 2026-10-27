import {build} from 'esbuild'
import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {join,extname} from 'node:path'
import {fixtureData} from './layout-review/data.mjs'

export async function fixtureServer(root, output, port=0) {
const bundle=await build({entryPoints:[join(root,'scripts/layout-review/fixture.tsx')],bundle:true,write:false,outdir:join(output,'bundle'),jsx:'automatic',format:'esm',external:['/fonts/*'],define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}','__APP_VERSION__':'"visual-fixture"','__APP_BUILD_NUMBER__':'1'},loader:{'.woff2':'file','.woff':'file','.png':'file','.svg':'file'},plugins:[{name:'fixture-identity',setup(b){b.onResolve({filter:/^\.\/organizationFunds$/},()=>({path:join(root,'src/ui/components/organizationFunds.ts')}));b.onResolve({filter:/^\.\/submissionAttachments$/},()=>({path:join(root,'src/ui/components/submissionAttachments.ts')}));b.onResolve({filter:/app\/AppProviders$/},()=>({path:'identity',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const useAuth=()=>({token:new URLSearchParams(location.search).get('viewer')==='visitor'?null:'synthetic-render-only',role:new URLSearchParams(location.search).get('viewer')==='visitor'?'guest':'member',isLoading:false,user:new URLSearchParams(location.search).get('viewer')==='visitor'?null:{id:'fixture-member',displayName:'Alex Morgan',name:'Alex Morgan',email:'member@example.invalid',themeMode:'light'},logout:()=>{},setThemeMode:()=>{}});export const useServices=()=>({});`}))}}]})
let base
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,base||'http://127.0.0.1'),path=url.pathname
 if(req.method!=='GET'){res.writeHead(405);res.end('Visual fixtures are read only');return}
 if(path.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(fixtureData(path,new URL(req.headers.referer||base).searchParams)));return}
 const asset=bundle.outputFiles.find(f=>f.path.endsWith('/'+path.slice(1)))
 if(asset){res.setHeader('Content-Type',path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(asset.contents);return}
 if(path==='/fixture-assets/lifetech-logo.png'){res.setHeader('Content-Type','image/png');res.end(await readFile(join(root,'scripts/layout-review/lifetech-logo.png')));return}
 if(/\.(svg|png|webp|woff2?|ico)$/.test(path)){
  if(path.includes('..')){res.writeHead(400);res.end();return}
  try{const file=await readFile(join(root,'public',path));res.setHeader('Content-Type',({'.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff'})[extname(path)]||'application/octet-stream');res.end(file)}catch{res.writeHead(404);res.end()}return
 }
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html id="html"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><body id="body"><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>')
})
await new Promise(r=>server.listen(port,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`
return {server,base}
}
