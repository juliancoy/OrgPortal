import {fixtureServer} from './fixture-server.mjs'
import {serviceDeskDraft} from './layout-review/data.mjs'
import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const root=resolve(import.meta.dirname,'..'),output=resolve(process.argv[2]||root+'/../artifacts/service-desk-drafts')
await mkdir(output,{recursive:true})
const {server,base}=await fixtureServer(root,output)
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
try{
 const report=[]
 for(const width of [1440,390])for(const mode of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:mode})
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
  let draft=structuredClone(serviceDeskDraft),saves=0,reviews=0
  await page.route('**/api/org/api/email/campaigns**',async route=>{
   const request=route.request(),url=new URL(request.url())
   if(request.method()==='PATCH'){
    const input=request.postDataJSON();expect(input.fingerprint).toBe(draft.fingerprint)
    draft={...draft,subject:input.subject,body:input.body,content_json:JSON.stringify({body_html:input.body_html}),fingerprint:'fixture-'+(++saves),preview:{...draft.preview,html:'<html><body style="font:16px/1.6 Arial;padding:28px">'+input.body_html+'</body></html>'}}
    await route.fulfill({json:{saved:true}});return
   }
   if(url.pathname.endsWith('/review-copy')){const input=request.postDataJSON();expect(input.recipient).toBe('julian@gmail.com');expect(input.fingerprint).toBe(draft.fingerprint);reviews++;await route.fulfill({json:{sent:true,recipient:input.recipient,audienceChanged:false}});return}
   await route.fulfill({json:url.pathname.endsWith('/campaigns')?[draft]:draft})
  })
  await page.goto(base+'/support?admin=1&folder=drafts&organization_id=fixture-org&campaign_id=fixture-draft&brand=lifetech')
  await expect(page.getByRole('region',{name:'Edit email draft'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Send preview to julian@gmail.com'})).toBeEnabled()
  expect(reviews).toBe(0)
  await expect(page.frameLocator('iframe[title="Draft email preview"]').getByRole('heading',{name:'Welcome to LifeTech',exact:true})).toBeVisible()
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);expect(overflow).toBe(false)
  await page.locator('iframe[title="Draft email preview"]').scrollIntoViewIfNeeded()
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  await page.screenshot({path:output+`/draft-${width}-${mode}.png`,fullPage:true})
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Updated welcome for our community')
  await expect(page.getByText('Changes saved.',{exact:true})).toBeVisible()
  expect(saves).toBe(1)
  await page.getByRole('button',{name:'Send preview to julian@gmail.com'}).click()
  await expect(page.getByRole('status').filter({hasText:'Preview accepted'})).toBeVisible()
  expect(reviews).toBe(1);expect(draft.recipient_count).toBe(12)
  await page.reload();await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveText('Updated welcome for our community')
  expect(errors).toEqual([])
  report.push({width,mode,overflow,saves,reviews,recipients:draft.recipient_count,errors})
  await context.close()
 }
 await writeFile(output+'/checks.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}finally{await browser.close();await new Promise(r=>server.close(r))}
