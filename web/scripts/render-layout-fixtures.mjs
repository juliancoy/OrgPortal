// Offline visual renders for local review and the distributed Portal visual suite.
import {build} from 'esbuild'
import {createServer} from 'node:http'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve,join,extname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {renderLayouts} from './render-layouts.mjs'
import {fixtureData} from './layout-review/data.mjs'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const output=resolve(process.argv[2]||join(root,'../artifacts/layout-review/fixtures'))
await mkdir(output,{recursive:true})
const bundle=await build({entryPoints:[join(root,'scripts/layout-review/fixture.tsx')],bundle:true,write:false,outdir:join(output,'bundle'),jsx:'automatic',format:'esm',external:['/fonts/*'],define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}','__APP_VERSION__':'"visual-fixture"','__APP_BUILD_NUMBER__':'1'},loader:{'.woff2':'file','.woff':'file','.png':'file','.svg':'file'},plugins:[{name:'fixture-identity',setup(b){b.onResolve({filter:/app\/AppProviders$/},()=>({path:'identity',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const useAuth=()=>({token:'synthetic-render-only',role:'member',isLoading:false,user:{id:'fixture-member',displayName:'Alex Morgan',name:'Alex Morgan',email:'member@example.invalid',themeMode:'light'},logout:()=>{},setThemeMode:()=>{}});export const useServices=()=>({});`}))}}]})
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
await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`
try{
 const layouts=[['Workspace','/workspace'],['Organizations','/orgs'],['Empty organizations','/orgs?empty=1'],['People','/people'],['Events','/events'],['Onboarding','/onboarding?brand=lifetech'],['Join now','/onboarding?brand=lifetech&complete=1','.onboarding-join-footer'],['Service desk','/support'],['Brand guide','/branding'],['About','/about']].map(([name,path,selector])=>({name,url:base+path,selector,ready:selector||'h1'}))
 const report=await renderLayouts(layouts,output)
 await import('node:fs/promises').then(fs=>fs.writeFile(join(output,'review.json'),JSON.stringify({mode:'synthetic-offline-fixtures',humanVisualReviewRequired:true,views:report.length,errors:report.filter(r=>r.error||r.errors?.length||r.brokenImages?.length),overflow:report.filter(r=>r.overflow)},null,2)))
 if(report.some(r=>r.error||r.errors?.length||r.brokenImages?.length||r.overflow))process.exitCode=1
}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
