import {audit,collectAestheticSnapshot} from './aesthetic-heuristics.mjs'
import {writeHeuristicReport,installCompositionGuides} from './aesthetic-report.mjs'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
import {_electron,chromium} from '@playwright/test'
import electron from 'electron'
import {electronEnvironment} from './runtime.mjs'
process.env.SITE_BRAND='lifetech';process.env.LIFETECH_DESKTOP_DEV='1'
const output=fileURLToPath(new URL('../../../artifacts/lifetech-aesthetics/',import.meta.url))
const heuristicConfiguration=process.env.ORGPORTAL_AESTHETIC_CONFIG?JSON.parse(await readFile(process.env.ORGPORTAL_AESTHETIC_CONFIG,'utf8')):{}
await mkdir(output,{recursive:true})
const server=await createServer({root:fileURLToPath(new URL('../../../BmoreMedTech/',import.meta.url)),server:{host:'127.0.0.1',port:0}})
await server.listen()
const origin=server.resolvedUrls.local[0]
const app=await _electron.launch({executablePath:electron,chromiumSandbox:true,args:['--disable-gpu','--ozone-platform=x11',fileURLToPath(new URL('./main.cjs',import.meta.url)),'--dev',origin],env:{...electronEnvironment(),WAYLAND_DISPLAY:'',XDG_CONFIG_HOME:output+'profile'}})
const manifest=[],report=[]
const heuristics=process.argv.includes('--heuristics')
try {
 const page=await app.firstWindow();page.setDefaultTimeout(15000)
 for(const theme of ['dark','light'])for(const width of [1180,680]){
  await app.evaluate(({nativeTheme,BrowserWindow},{theme,width})=>{nativeTheme.themeSource=theme;BrowserWindow.getAllWindows()[0].setSize(width,800)},{theme,width})
  for(const [name,path] of [['home','/'],['calendar','/calendar'],['events','/org-events'],['datasets','/datasets'],['about','/about'],['ecosystem','/ecosystem']]){
   const id=`${name}-${theme}-${width}`
   await page.goto(new URL(path,origin).href,{waitUntil:'domcontentloaded'})
   await page.waitForFunction(()=>document.documentElement.dataset.desktop==='true')
   await page.evaluate(()=>{localStorage.setItem('lifetech.theme','system');document.documentElement.dataset.themeMode='system'})
   await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme)
   await page.waitForTimeout(550)
   const findings=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,heading:document.querySelector('h1')?.textContent.trim(),theme:document.documentElement.dataset.theme,brokenImages:[...document.images].filter(e=>e.getBoundingClientRect().width&&e.complete&&!e.naturalWidth).map(e=>e.getAttribute('src')),headerHeight:document.querySelector('header')?.getBoundingClientRect().height}))
   await page.screenshot({path:output+id+'.png'})
   if(heuristics){
    const snapshot=await page.evaluate(collectAestheticSnapshot)
    findings.heuristics=audit(snapshot,heuristicConfiguration)
    await writeFile(output+id+'-measurements.json',JSON.stringify(snapshot,null,2))
    await page.evaluate(installCompositionGuides,{frame:snapshot.frame,focal:snapshot.focal})
    await page.screenshot({path:output+id+'-guides.png'})
    await page.locator('#aesthetic-composition-guides').evaluate(e=>e.remove())
   }
   manifest.push({name:id,url:page.url()});report.push({name:id,...findings});console.log(id,JSON.stringify({...findings,heuristics:findings.heuristics?{errors:findings.heuristics.errors,review:findings.heuristics.review}:undefined}))
  }
 }
 await writeFile(output+'manifest.json',JSON.stringify(manifest,null,2));await writeFile(output+'report.json',JSON.stringify(report,null,2))
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true})
 try{const sheet=await browser.newPage({viewport:{width:1600,height:1000}});const figures=await Promise.all(report.map(async r=>`<figure><figcaption>${r.name}</figcaption><img src="data:image/png;base64,${(await readFile(output+r.name+'.png')).toString('base64')}"></figure>`));await sheet.setContent(`<style>body{margin:0;padding:16px;background:#202628;color:white;font:14px system-ui}main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0}figcaption{padding:8px}img{width:100%}</style><main>${figures.join('')}</main>`);await sheet.screenshot({path:output+'contact.png',fullPage:true})}finally{await browser.close()}
 if(heuristics){const summary=await writeHeuristicReport(report,output);console.log('Heuristic audit:',JSON.stringify(summary));if(summary.errors)process.exitCode=1}
 if(report.some(r=>r.overflow||r.brokenImages.length))process.exitCode=1
}finally{await app.close();await server.close()}
