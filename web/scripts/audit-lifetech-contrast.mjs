import {chromium} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const base=new URL(process.argv[2]||'https://localhost:8770')
if(!['localhost','127.0.0.1','lifetech.fyi'].includes(base.hostname))throw Error('Use the LifeTech site or a local preview')
const out=resolve(process.argv[3]||'../artifacts/lifetech-contrast/local');await mkdir(out,{recursive:true})
const paths=process.argv.slice(4);if(!paths.length)paths.push('/','/about','/start','/calendar','/taxonomy','/datasets','/org-events','/orgs/lifetech?tab=branding','/events/lifetech-demo-day-3')
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome'})
const report=[]
try{for(const theme of ['light','dark'])for(const path of paths){
 const context=await browser.newContext({ignoreHTTPSErrors:true,colorScheme:theme,viewport:{width:1440,height:1000},reducedMotion:'reduce'})
 await context.addInitScript(theme=>{for(const key of ['lifetech.theme','orgportal.theme'])localStorage.setItem(key,theme)},theme)
 await context.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.fulfill({status:204}))
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 const item={theme,path,errors}
 try{
  const response=await page.goto(new URL(path,base).href,{waitUntil:'domcontentloaded',timeout:30000});item.status=response.status()
  await page.waitForTimeout(2200);await page.evaluate(()=>document.fonts.ready)
  if(!(await page.locator('body').innerText()).trim())throw Error('The page is blank')
  item.brand=await page.evaluate(()=>({site:document.documentElement.dataset.siteBrand,portal:document.documentElement.dataset.portalProfile,teal:getComputedStyle(document.documentElement).getPropertyValue('--brand-teal').trim()}))
  if(item.brand.site!=='lifetech'&&item.brand.portal!=='lifetech')throw Error('The page did not resolve LifeTech branding')
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')})
  const results=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'rule',values:['color-contrast','link-in-text-block']},resultTypes:['violations','incomplete']}))
  item.url=page.url();item.profile=await page.locator('html').getAttribute('data-portal-profile');item.title=await page.title()
  item.violations=results.violations.map(rule=>({id:rule.id,nodes:rule.nodes.map(node=>({target:node.target,html:node.html,summary:node.failureSummary,data:node.any.map(check=>check.data)}))}))
  item.incomplete=results.incomplete.map(rule=>({id:rule.id,count:rule.nodes.length}))
  item.file=path.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')+'-'+theme+'.png';await page.screenshot({path:join(out,item.file),fullPage:true})
 }catch(error){item.error=error.message}
 report.push(item);await context.close();console.log(JSON.stringify({theme,path,violations:item.violations?.reduce((n,r)=>n+r.nodes.length,0),error:item.error}))
}}finally{await browser.close();await writeFile(join(out,'report.json'),JSON.stringify({base:base.href,scope:'WCAG contrast and distinguishable text links; automatic writes suppressed; incomplete checks require visual review',pages:report},null,2)+'\n')}
if(report.some(p=>p.error||p.violations?.length))process.exitCode=1
