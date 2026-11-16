import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {fixtureServer} from './fixture-server.mjs'
import {browserLaunch} from './browser-launch.mjs'

const root=resolve(new URL('..',import.meta.url).pathname)
const output=resolve(process.argv[2]||join(root,'../artifacts/submission-times'))
await mkdir(output,{recursive:true})
const submitted='2026-11-01T17:50:24.000Z',guestTime='2026-11-02T14:15:00.000Z'
const rows=[
 {submission_id:'timed',organization_id:'fixture-org',organization_name:'Harbor Research',organization_slug:'harbor',title:'A timestamped application',summary:'A synthetic application for local review.',status:'submitted',favorites:2,submitted_at:submitted,submission_time_source:'submission',updated_at:'2026-11-16T18:00:00Z',presenters:[],attachments:[]},
 {submission_id:'historical',organization_id:'fixture-org',organization_name:'Earlier Research',organization_slug:'earlier',title:'An older application',summary:'Original receipt time was not preserved.',status:'submitted',favorites:1,submitted_at:submitted,submission_time_source:'first_recorded',updated_at:'2026-11-16T18:00:00Z',presenters:[],attachments:[]},
]
const {server,base}=await fixtureServer(root,output,0,{localOnly:true,apiResponse:async url=>{
 const path=url.pathname
 if(path.endsWith('/presentations/submissions'))return {json:{submissions:rows,favoriteLimit:3,next:null}}
 if(path.endsWith('/presentations/review'))return {json:{submissions:rows,counts:{all:2,submitted:2,accepted:0,declined:0},total:2,page:1,pages:1,pageSize:25}}
 if(path.endsWith('/presentations/guest-review'))return {json:{submissions:[{id:'guest',contact_name:'Guest Person',organization_name:'Guest Team',title:'Guest application',summary:'Synthetic guest proposal',email:'guest@example.invalid',teammate_email:'teammate@example.invalid',created_at:guestTime,acknowledgement_status:'unavailable'}]}}
 if(path.endsWith('/presentations'))return {json:{canReview:true,submissions:rows}}
}})
const browser=await chromium.launch(browserLaunch()),results=[]
try{
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:1100},timezoneId:'America/New_York'}),page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(base+'/submissions?brand=lifetech')
  const cards=page.locator('.applicant-row');await expect(cards).toHaveCount(2)
  await expect(cards.first().locator('time')).toHaveAttribute('datetime',submitted)
  await expect(cards.first()).toContainText('Submitted Nov 1, 2026, 12:50:24 PM EST')
  await expect(cards.last()).toContainText('First recorded')
  await cards.first().locator('.applicant-open').click()
  const modal=page.locator('dialog.applicant-modal');await expect(modal).toBeVisible()
  await expect(modal.locator('time')).toHaveAttribute('datetime',submitted)
  await modal.screenshot({path:join(output,`details-${width}.png`)})
  await modal.getByRole('button',{name:'Close applicant details'}).click()
  await page.getByText('Manage submissions',{exact:true}).click()
  const review=page.getByRole('region',{name:'Review applications',exact:true})
  await expect(review.locator('time')).toHaveCount(2)
  await expect(review).toContainText('Submitted Nov 1, 2026, 12:50:24 PM EST')
  await expect(review).toContainText('Updated')
  const guest=page.getByRole('region',{name:'Applications without login',exact:true})
  await expect(guest.locator('time')).toHaveAttribute('datetime',guestTime)
  await expect(guest).toContainText('Submitted Nov 2, 2026, 9:15:00 AM EST')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.locator('.presentation-applications').screenshot({path:join(output,`applications-${width}.png`)})
  expect(errors).toEqual([]);results.push({width,result:'passed',timezone:'America/New_York'});await context.close()
 }
 await writeFile(join(output,'checks.json'),JSON.stringify({isolation:'local-only read-only synthetic fixtures',results},null,2))
 console.log('PASS: cards, details, team review and guest review show timezone-qualified submission times on mobile and desktop; historical timestamps labeled separately.')
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
