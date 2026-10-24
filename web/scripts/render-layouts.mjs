import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
const require=createRequire(join(process.cwd(),'package.json'))
const {chromium}=require('@playwright/test')
export async function renderLayouts(layouts, outputPath) {
const out=resolve(outputPath);await mkdir(out,{recursive:true})
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||(existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':undefined)})
const report=[]
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
try{
 for(const theme of ['light','dark'])for(const [device,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  const shots=[]
  for(const layout of layouts){
   const url=new URL(layout.url)
   if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Render local URLs only; use fixtures for private layouts')
   const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height},colorScheme:theme,locale:'en-US',timezoneId:'America/New_York',reducedMotion:'reduce'})
   await context.addInitScript(theme=>{localStorage.setItem('orgportal.theme',theme)},theme)
   const page=await context.newPage();const errors=[]
   page.on('pageerror',e=>errors.push(e.message))
   const name=layout.name.replace(/[^a-z0-9-]/gi,'-').toLowerCase(),file=`${name}-${device}-${theme}.png`
   try{
    await page.goto(layout.url,{waitUntil:'domcontentloaded',timeout:30000})
    if(layout.ready)await page.locator(layout.ready).first().waitFor({timeout:12000})
    await page.evaluate(()=>document.fonts.ready)
    await page.waitForTimeout(1000)
    await page.evaluate(async()=>{
     const visible=[...document.images].filter(image=>{const r=image.getBoundingClientRect();return r.width&&r.height&&r.top<innerHeight&&r.bottom>0})
     await Promise.race([Promise.allSettled(visible.map(image=>image.decode())),new Promise(resolve=>setTimeout(resolve,2000))])
    })
    const target=layout.selector?page.locator(layout.selector).first():page
    await target.screenshot({path:join(out,file),animations:'disabled'})
    report.push({name,theme,device,file,finalUrl:page.url(),brokenImages:await page.evaluate(()=>[...document.images].filter(image=>image.complete&&!image.naturalWidth&&image.getBoundingClientRect().width>0).map(image=>({alt:image.alt,path:new URL(image.currentSrc||image.src,location.href).pathname}))),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors})
    shots.push({name:layout.name,file})
   }catch(error){report.push({name,theme,device,error:String(error),errors})}
   finally{await context.close()}
  }
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1})
  const page=await context.newPage()
  const cards=await Promise.all(shots.map(async shot=>`<figure><figcaption>${escape(shot.name)} · ${device} · ${theme}</figcaption><img src="data:image/png;base64,${(await readFile(join(out,shot.file))).toString('base64')}"></figure>`))
  await page.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;background:#dfe5ec;font:14px system-ui;padding:20px}main{display:grid;grid-template-columns:repeat(${device==='desktop'?2:4},1fr);gap:16px;align-items:start}figure{margin:0;overflow:hidden;background:white;border:1px solid #bac5d3;border-radius:8px}figcaption{padding:10px;font-weight:650}img{display:block;width:100%;height:auto}</style><main>${cards.join('')}</main></html>`)
  await page.screenshot({path:join(out,`contact-${device}-${theme}.png`),fullPage:true})
  await context.close()
 }
}finally{await browser.close();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2))}
console.log(`Rendered ${report.filter(r=>r.file).length} views in ${out}; ${report.filter(r=>r.error).length} failed`)

return report
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const [manifestPath,outputPath]=process.argv.slice(2)
 if(!manifestPath||!outputPath)throw Error('Usage: render-layouts.mjs manifest.json output-directory')
 await renderLayouts(JSON.parse(await readFile(resolve(manifestPath),'utf8')),outputPath)
}
