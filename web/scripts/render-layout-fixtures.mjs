import {execFileSync} from 'node:child_process'
import {testUploadImageCompression} from './test-upload-image-compression.mjs'
import {testOrganizationBranding} from './test-organization-branding.mjs'
import {fixtureServer} from './fixture-server.mjs'
// Offline visual renders for local review and the distributed Portal visual suite.
import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {renderLayouts} from './render-layouts.mjs'
import {reviewUserTask,userModel} from './user-model/review.mjs'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const output=resolve(process.argv[2]||join(root,'../artifacts/layout-review/fixtures'))
await mkdir(output,{recursive:true})
await testUploadImageCompression()
const {server,base}=await fixtureServer(root,output)
try{
 await testOrganizationBranding(base,output)
 const layouts=[['Workspace','/workspace'],['Organizations','/orgs'],['Empty organizations','/orgs?empty=1'],['People','/people'],['Events','/events'],['Onboarding','/onboarding?brand=lifetech'],['Join now','/onboarding?brand=lifetech&complete=1','.onboarding-join-footer'],['Service desk','/support'],['Brand guide','/branding'],['About','/about']].map(([name,path,selector])=>({name,url:base+path,selector,ready:selector||'h1'}))
 const accountMenuLayout={name:'LifeTech account menu',url:base+'/branding?brand=lifetech',ready:'button[aria-label="Open user menu"]',actions:[{click:'Open user menu'}],visible:['#portal-user-menu a[href="/profile"]','#portal-user-menu a[href="/settings"]'],hidden:['.portal-deployment-switcher','#portal-user-menu a[href="/dev-tools"]','#portal-user-menu a[href="/test-status"]']}
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
 execFileSync(process.execPath,[join(root,'scripts/test-application-journeys.mjs'),output],{cwd:root,stdio:'inherit',env:{...process.env,APPLICATION_COMPACT_CAPTURES:'1'}})
 const report=await renderLayouts(process.env.SUBMISSION_REVIEW_ONLY?submissionLayouts:[...layouts,accountMenuLayout,...supportLayouts,...submissionLayouts],output)
 // Exercise actual controls against synthetic, in-memory vote responses only.
 const browser=await chromium.launch({headless:true})
 const interactionResults=[]
 const userReviews=[]
 try{
  for(const width of [320,390,1440]){
   const context=await browser.newContext({viewport:{width,height:1000},colorScheme:'light'})
   const page=await context.newPage();let selected=true,votes=0,releaseVote,failVote=false
   await page.route('**/presentations/favorites**',async route=>{
    if(route.request().method()==='PUT'){
     votes++
     await new Promise(resolve=>{releaseVote=resolve})
     if(failVote){await route.fulfill({status:503,json:{message:'Favorite could not be saved. Try again.'}});return}
     selected=Boolean(route.request().postDataJSON().selected)
     await route.fulfill({json:{selected}})
    }else await route.fulfill({json:{favorites:selected?['fixture-submission']:[],limit:3}})
   })
   await page.goto(base+'/event-apply-options?brand=lifetech')
   const registered=page.getByRole('link',{name:'Apply with an organization',exact:true}),guest=page.getByRole('link',{name:'Apply as a guest',exact:true})
   await registered.waitFor()
   for(const task of ['apply-organization','apply-guest']) {
    const result=await reviewUserTask(page,task,{eventSlug:'lifetech-demo-day-3',eventId:'fixture-event'})
    userReviews.push({width,...result})
    if(result.status==='failed')throw Error(`User task failed: ${task} at ${width}px`)
   }
   if(await registered.getAttribute('href')!=='/events/lifetech-demo-day-3/apply')throw Error('Registered application link is incorrect')
   if(await guest.getAttribute('href')!=='/events/lifetech-demo-day-3/apply/guest')throw Error('Guest application link is incorrect')
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
   if(!await page.getByText('0 of 3 favorites selected · Saving…',{exact:true}).isVisible())throw Error('Favorite selection must update before save completes')
   if(!await card.locator('.submission-card-footer').getByText('0 favorites',{exact:true}).isVisible())throw Error('Favorite count must update immediately')
   await expect.poll(()=>votes).toBe(1)
   releaseVote();await page.waitForFunction(()=>!document.querySelector('.submission-card-select')?.disabled)
   const vote=card.locator('.submission-card-select');await vote.focus();await page.keyboard.press('Enter')
   await page.waitForFunction(()=>document.querySelector('.submission-card-select')?.getAttribute('aria-pressed')==='true')
   await expect.poll(()=>votes).toBe(2)
   releaseVote();await page.waitForFunction(()=>!document.querySelector('.submission-card-select')?.disabled)
   failVote=true
   await vote.click()
   await page.waitForFunction(()=>document.querySelector('.submission-card-select')?.getAttribute('aria-pressed')==='false')
   await expect.poll(()=>votes).toBe(3)
   releaseVote()
   await page.getByRole('alert').filter({hasText:'Favorite could not be saved'}).waitFor()
   if(await vote.getAttribute('aria-pressed')!=='true'||!await card.locator('.submission-card-footer').getByText('1 favorite',{exact:true}).isVisible())throw Error('Failed favorite must restore selection and count')
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Submission layout overflows viewport')
   interactionResults.push({width,status:'passed',checks:11});await context.close()
  }
 }finally{await browser.close();await writeFile(join(output,'submission-interactions.json'),JSON.stringify(interactionResults,null,2))}
 await writeFile(join(output,'user-heuristics.json'),JSON.stringify({modelVersion:userModel.version,mode:'synthetic-affordance-review',tasks:userReviews,unassessed:userModel.tasks.filter(task=>!userReviews.some(review=>review.task===task.id)).map(task=>task.id),limitations:'No completed application, real sign-in, saved settings, keyboard journey, slow-network or human usability result is inferred from these fixture checks.'},null,2)+'\n')
 await import('node:fs/promises').then(fs=>fs.writeFile(join(output,'review.json'),JSON.stringify({mode:'synthetic-offline-fixtures',humanVisualReviewRequired:true,views:report.length,errors:report.filter(r=>r.error||r.errors?.length||r.brokenImages?.length),overflow:report.filter(r=>r.overflow)},null,2)))
 if(report.some(r=>r.error||r.errors?.length||r.brokenImages?.length||r.overflow))process.exitCode=1
}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
