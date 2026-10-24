// Offline visual renders for local review and the distributed Portal visual suite.
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {createServer} from 'node:http'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {resolve,join,extname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {renderLayouts} from './render-layouts.mjs'
import {fixtureData} from './layout-review/data.mjs'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const output=resolve(process.argv[2]||join(root,'../artifacts/layout-review/fixtures'))
await mkdir(output,{recursive:true})
const bundle=await build({entryPoints:[join(root,'scripts/layout-review/fixture.tsx')],bundle:true,write:false,outdir:join(output,'bundle'),jsx:'automatic',format:'esm',external:['/fonts/*'],define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}','__APP_VERSION__':'"visual-fixture"','__APP_BUILD_NUMBER__':'1'},loader:{'.woff2':'file','.woff':'file','.png':'file','.svg':'file'},plugins:[{name:'fixture-identity',setup(b){b.onResolve({filter:/^\.\/submissionAttachments$/},()=>({path:join(root,'src/ui/components/submissionAttachments.ts')}));b.onResolve({filter:/app\/AppProviders$/},()=>({path:'identity',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const useAuth=()=>({token:'synthetic-render-only',role:'member',isLoading:false,user:{id:'fixture-member',displayName:'Alex Morgan',name:'Alex Morgan',email:'member@example.invalid',themeMode:'light'},logout:()=>{},setThemeMode:()=>{}});export const useServices=()=>({});`}))}}]})
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
 const supportLayouts=[
  {name:'Service conversation',url:base+'/support/fixture-ticket?admin=1',ready:'.support-thread'},
  {name:'Service compose',url:base+'/support',ready:'.support-compose-button:not(:disabled)',actions:[{click:'New message'}]},
  {name:'Service settings',url:base+'/support?admin=1',ready:'.support-settings-button',actions:[{click:'Mailbox settings'}]},
  {name:'Empty service inbox',url:base+'/support?empty=1',ready:'.support-compose-button:not(:disabled)'},
 ]
 const submissionLayouts=[
  {name:'Collapsed submission',url:base+'/submissions?brand=lifetech&submissionReview=1',ready:'.submission-voting-card',selector:'.presentation-applications',hidden:['.submission-card-details']},
  {name:'Expanded submission',url:base+'/submissions?brand=lifetech&submissionReview=1',ready:'.submission-voting-card',selector:'.presentation-applications',actions:[{click:'Expand submission: The Limits of Contemporary Medicine'}],visible:['.submission-card-details']},
  {name:'Unselected submission',url:base+'/submissions?brand=lifetech&submissionReview=1&unselected=1',ready:'.submission-voting-card',selector:'.presentation-applications',hidden:['.submission-card-details']},
 ]
 const report=await renderLayouts(process.env.SUBMISSION_REVIEW_ONLY?submissionLayouts:[...layouts,...supportLayouts,...submissionLayouts],output)
 // Exercise actual controls against synthetic, in-memory vote responses only.
 const browser=await chromium.launch({headless:true})
 const interactionResults=[]
 try{
  for(const width of [320,390,1440]){
   const context=await browser.newContext({viewport:{width,height:1000},colorScheme:'light'})
   const page=await context.newPage();let selected=true,votes=0
   await page.route('**/presentations/favorites**',async route=>{
    if(route.request().method()==='PUT'){
     selected=Boolean(route.request().postDataJSON().selected);votes++
     await route.fulfill({json:{selected}})
    }else await route.fulfill({json:{favorites:selected?['fixture-submission']:[],limit:3}})
   })
   await page.goto(base+'/submissions?brand=lifetech&submissionReview=1')
   const card=page.locator('.submission-voting-card'),details=card.locator('.submission-card-details')
   await card.waitFor()
   if(await details.isVisible())throw Error('Collapsed details are visible')
   await page.getByRole('button',{name:'Expand submission: The Limits of Contemporary Medicine',exact:true}).click()
   if(!await details.isVisible()||votes)throw Error('Expand changed the vote or failed to reveal details')
   await card.getByText('View team',{exact:true}).click()
   if(!await card.getByText('Sam Rivera',{exact:true}).isVisible()||votes)throw Error('Team disclosure failed or changed vote')
   await card.getByRole('button',{name:'Edit application',exact:true}).click()
   await card.getByRole('button',{name:'Delete application',exact:true}).click()
   if(!await card.locator('dialog').isVisible()||votes)throw Error('Delete confirmation failed or changed vote')
   await card.getByRole('button',{name:'Cancel',exact:true}).click()
   await page.getByRole('button',{name:'Collapse submission: The Limits of Contemporary Medicine',exact:true}).click()
   if(await details.isVisible())throw Error('Collapse did not hide details')
   const title=card.getByRole('heading',{name:'The Limits of Contemporary Medicine',exact:true})
   await title.evaluate(el=>el.scrollIntoView({block:'center'}))
   const rect=await title.boundingBox();await page.mouse.click(rect.x+10,rect.y+10)
   await page.waitForFunction(()=>document.querySelector('.submission-card-select')?.getAttribute('aria-pressed')==='false')
   if(votes!==1)throw Error('Card click must change vote exactly once')
   const vote=card.locator('.submission-card-select');await vote.focus();await page.keyboard.press('Enter')
   await page.waitForFunction(()=>document.querySelector('.submission-card-select')?.getAttribute('aria-pressed')==='true')
   if(votes!==2)throw Error('Keyboard vote must change vote exactly once')
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Submission layout overflows viewport')
   interactionResults.push({width,status:'passed',checks:8});await context.close()
  }
 }finally{await browser.close();await writeFile(join(output,'submission-interactions.json'),JSON.stringify(interactionResults,null,2))}
 await import('node:fs/promises').then(fs=>fs.writeFile(join(output,'review.json'),JSON.stringify({mode:'synthetic-offline-fixtures',humanVisualReviewRequired:true,views:report.length,errors:report.filter(r=>r.error||r.errors?.length||r.brokenImages?.length),overflow:report.filter(r=>r.overflow)},null,2)))
 if(report.some(r=>r.error||r.errors?.length||r.brokenImages?.length||r.overflow))process.exitCode=1
}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
