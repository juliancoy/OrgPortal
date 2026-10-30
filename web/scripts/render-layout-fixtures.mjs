import {testSlowConnection} from './slow-connection-checks.mjs'
import {testEventApplicants} from './event-applicants-checks.mjs'
import {testEventStandings} from './event-standings-checks.mjs'
import {testOrganizationProfile} from './organization-profile-checks.mjs'
import {testOrganizationThemes} from './organization-themes-checks.mjs'
import {execFileSync} from 'node:child_process'
import {testUploadImageCompression} from './test-upload-image-compression.mjs'
import {testPosterDesign} from './poster-design-checks.mjs'
import {testOrganizationPersonnel} from './organization-personnel-checks.mjs'
import {testOrganizationBranding} from './organization-branding-checks.mjs'
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
 await testSlowConnection(root,output)
 await testEventApplicants(base,join(output,'event-applicants'))
 await testEventStandings(base,join(output,'event-standings'),output)
 await testOrganizationThemes(base,join(output,'organization-themes'),output)
 await testOrganizationBranding(base,join(output,'organization-branding'),output)
 await testOrganizationPersonnel(base,join(output,'organization-personnel'))
 await testOrganizationProfile(base,join(output,'organization-profile'),output)
 await testPosterDesign(base,output)
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
  {name:'Collapsed submission',url:base+'/submissions?brand=lifetech&submissionReview=1',ready:'.applicant-row',selector:'.presentation-applications',hidden:['.applicant-overlay']},
  {name:'Expanded submission',url:base+'/submissions?brand=lifetech&submissionReview=1',ready:'.applicant-row',selector:'.applicant-modal',actions:[{click:'View Harbor Research Collective application: The Limits of Contemporary Medicine'}],visible:['.applicant-modal']},
  {name:'Unselected submission',url:base+'/submissions?brand=lifetech&submissionReview=1&unselected=1',ready:'.applicant-row',selector:'.presentation-applications',hidden:['.applicant-overlay']},
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
   const card=page.locator('.applicant-row').first()
   await card.waitFor()
   await card.locator('.applicant-open').click()
   const modal=page.locator('dialog.applicant-modal')
   await expect(modal).toBeVisible();await expect(modal).toContainText('Sam Rivera')
   await modal.getByRole('button',{name:'Delete application',exact:true}).click()
   const confirmation=modal.locator('dialog');await expect(confirmation).toBeVisible()
   await confirmation.getByRole('button',{name:'Cancel',exact:true}).click()
   await modal.getByRole('button',{name:'Close applicant details'}).click()
   const vote=card.locator('.applicant-vote')
   await vote.click();await expect(vote).toHaveAttribute('aria-pressed','false');await expect(vote.locator('span')).toHaveText('0')
   await expect.poll(()=>votes).toBe(1);releaseVote();await expect(vote).toBeEnabled()
   await vote.focus();await page.keyboard.press('Enter');await expect(vote).toHaveAttribute('aria-pressed','true')
   await expect.poll(()=>votes).toBe(2);releaseVote();await expect(vote).toBeEnabled()
   failVote=true;await vote.click();await expect(vote).toHaveAttribute('aria-pressed','false')
   await expect.poll(()=>votes).toBe(3);releaseVote()
   await expect(page.getByRole('alert').filter({hasText:'Favorite could not be saved'})).toBeVisible()
   await expect(vote).toHaveAttribute('aria-pressed','true');await expect(vote.locator('span')).toHaveText('1')
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Submission layout overflows viewport')
   interactionResults.push({width,status:'passed',checks:11});await context.close()
  }
 }finally{await browser.close();await writeFile(join(output,'submission-interactions.json'),JSON.stringify(interactionResults,null,2))}
 await writeFile(join(output,'user-heuristics.json'),JSON.stringify({modelVersion:userModel.version,mode:'synthetic-affordance-review',tasks:userReviews,unassessed:userModel.tasks.filter(task=>!userReviews.some(review=>review.task===task.id)).map(task=>task.id),limitations:'No completed application, real sign-in, saved settings, keyboard journey, slow-network or human usability result is inferred from these fixture checks.'},null,2)+'\n')
 await import('node:fs/promises').then(fs=>fs.writeFile(join(output,'review.json'),JSON.stringify({mode:'synthetic-offline-fixtures',humanVisualReviewRequired:true,views:report.length,errors:report.filter(r=>r.error||r.errors?.length||r.brokenImages?.length),overflow:report.filter(r=>r.overflow)},null,2)))
 if(report.some(r=>r.error||r.errors?.length||r.brokenImages?.length||r.overflow))process.exitCode=1
}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
