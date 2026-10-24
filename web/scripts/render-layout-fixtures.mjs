import {fixtureServer} from './fixture-server.mjs'
// Offline visual renders for local review and the distributed Portal visual suite.
import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {renderLayouts} from './render-layouts.mjs'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const output=resolve(process.argv[2]||join(root,'../artifacts/layout-review/fixtures'))
await mkdir(output,{recursive:true})
const {server,base}=await fixtureServer(root,output)
try{
 const layouts=[['Workspace','/workspace'],['Organizations','/orgs'],['Empty organizations','/orgs?empty=1'],['People','/people'],['Events','/events'],['Onboarding','/onboarding?brand=lifetech'],['Join now','/onboarding?brand=lifetech&complete=1','.onboarding-join-footer'],['Service desk','/support'],['Brand guide','/branding'],['About','/about']].map(([name,path,selector])=>({name,url:base+path,selector,ready:selector||'h1'}))
 const supportLayouts=[
  {name:'Service conversation',url:base+'/support/fixture-ticket?admin=1',ready:'.support-thread'},
  {name:'Service compose',url:base+'/support',ready:'.support-compose-button:not(:disabled)',actions:[{click:'New message'}]},
  {name:'Service settings',url:base+'/support?admin=1',ready:'.support-settings-button',actions:[{click:'Mailbox settings'}]},
  {name:'Empty service inbox',url:base+'/support?empty=1',ready:'.support-compose-button:not(:disabled)'},
 ]
 const submissionLayouts=[
  {name:'Event application options',url:base+'/event-apply-options?brand=lifetech',ready:'.event-apply-actions',selector:'.panel',visible:['a:has-text("Apply with an organization")','a:has-text("Apply as a guest")']},
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
   await page.goto(base+'/event-apply-options?brand=lifetech')
   const registered=page.getByRole('link',{name:'Apply with an organization',exact:true}),guest=page.getByRole('link',{name:'Apply as a guest',exact:true})
   await registered.waitFor()
   if(await registered.getAttribute('href')!=='/events/lifetech-demo-day-3/apply')throw Error('Registered application link is incorrect')
   if(await guest.getAttribute('href')!=='/api/org/api/network/events/fixture-event/presentations/apply')throw Error('Guest application link is incorrect')
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Application options overflow viewport')
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
