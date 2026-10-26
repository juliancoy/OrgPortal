process.env.LIFETECH_DESKTOP_DEV = '1'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { _electron, chromium } from '@playwright/test'
import electron from 'electron'
import { electronEnvironment } from './runtime.mjs'
process.env.SITE_BRAND='lifetech'
const output=fileURLToPath(new URL('../../../artifacts/lifetech-clickthrough/',import.meta.url))
await mkdir(output,{recursive:true})
const server=await createServer({root:fileURLToPath(new URL('../../../BmoreMedTech/',import.meta.url)),server:{host:'127.0.0.1',port:0}})
await server.listen()
const origin=server.resolvedUrls.local[0]
const application=await _electron.launch({executablePath:electron,chromiumSandbox:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ozone-platform=x11',fileURLToPath(new URL('./main.cjs',import.meta.url)),'--dev',origin],env:{...electronEnvironment(),WAYLAND_DISPLAY:'',XDG_CONFIG_HOME:output+'profile'}})
const report=[]
try {
 const page=await application.firstWindow();page.setDefaultTimeout(5000)
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 for(const [name,href] of [['home','/'],['calendar','/calendar'],['atlas','/taxonomy'],['datasets','/datasets'],['about','/about'],['events','/org-events'],['login','/users/login'],['ecosystem','/ecosystem'],['map','/map'],['start','/start'],['atlas-dark','/taxonomy'],['datasets-dark','/datasets']]) {
  try {
   await page.goto(origin,{waitUntil:'domcontentloaded'})
   await page.waitForFunction(()=>document.documentElement.dataset.desktop==='true')
   await page.evaluate(mode=>{localStorage.setItem('lifetech.theme',mode);document.documentElement.dataset.theme=mode},name.endsWith('-dark')?'dark':'light')
   if(href!=='/') {
    const link=page.locator(`a[href="${href}"]`).first()
    const group=link.locator('xpath=ancestor::details')
    if(await group.count()) await group.locator('summary').click()
    if(name==='login') await application.evaluate(({Menu})=>Menu.getApplicationMenu().items[0].submenu.items.find(item=>item.label==='Sign in Here').click())
    else await link.click()
    await page.waitForURL(url=>url.pathname===href || name==='login' && (url.pathname.startsWith('/pidp/') || url.hostname==='id.localhost'))
    await page.waitForLoadState('domcontentloaded')
    if(name==='login') await page.locator('#login-email').or(page.getByRole('link',{name:'Continue with email',exact:true})).first().waitFor({timeout:15000})
    else await page.waitForFunction(()=>document.documentElement.dataset.desktop==='true')
   }
   if(name==='map') await page.waitForFunction(()=>window.__bmoreLifeTechMapReady===true,null,{timeout:12000}).catch(()=>{})
   await page.waitForTimeout(700)
   const data=await page.evaluate(()=>({url:location.origin+location.pathname,title:document.title,headings:[...document.querySelectorAll('h1')].map(e=>e.textContent.trim()),overflow:document.documentElement.scrollWidth>innerWidth,body:document.body.innerText.slice(0,500),brokenImages:[...document.images].filter(i=>i.complete&&!i.naturalWidth&&i.getBoundingClientRect().width).map(i=>i.getAttribute('src'))}))
   const issues=[]
   if(name!=='home' && data.headings.includes('Baltimore’s health, medicine & biotech community.')) issues.push('Navigation returned the homepage')
   if(data.url.startsWith('chrome-error:') || !data.body.trim()) issues.push('Navigation produced an empty or browser error page')
   if(data.body.includes('invalid_portal')) issues.push('Local identity service rejects the LifeTech origin')
   if(name==='map' && data.body.includes('Loading map')) issues.push('Map has not finished loading')
   if(data.overflow) issues.push('Horizontal overflow')
   await page.screenshot({path:output+name+'.png'});report.push({name,href,...data,issues});console.log(name,JSON.stringify(data.headings),data.overflow?'OVERFLOW':'')
  }catch(e){report.push({name,href,error:e.message});console.log(name,e.message.slice(0,180))}
 }
 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(680,800))
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.documentElement.dataset.desktop==='true')
 await page.getByRole('button',{name:'Menu',exact:true}).click();await page.screenshot({path:output+'narrow-menu.png'})
 report.push({name:'narrow-menu',visible:await page.locator('#primary-nav').isVisible()})
 await writeFile(output+'report.json',JSON.stringify({report,errors},null,2))
 if(report.some(r=>r.error||r.issues?.length)||errors.length) process.exitCode=1
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true})
 try {
  const sheet=await browser.newPage({viewport:{width:1600,height:1000}})
  const shots=await Promise.all(report.filter(r=>r.headings).map(async r=>`<figure><figcaption>${r.name}: ${r.headings.join(' / ')}</figcaption><img src="data:image/png;base64,${(await readFile(output+r.name+'.png')).toString('base64')}"></figure>`))
  await sheet.setContent(`<style>body{margin:0;padding:16px;background:#ddd;font:16px system-ui}main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0;background:white}figcaption{padding:8px}img{width:100%}</style><main>${shots.join('')}</main>`)
  await sheet.screenshot({path:output+'contact.png',fullPage:true})
 }finally{await browser.close()}
}finally{await application.close();await server.close()}
