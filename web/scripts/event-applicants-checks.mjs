import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
export async function testEventApplicants(base,output){
 await mkdir(output,{recursive:true})
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})})
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message))
  const event={id:'fixture-event',slug:'demo-day',title:'LifeTech Demo Day',host_org_id:'fixture-org',organization_slug:'lifetech',organization_name:'LifeTech',starts_at:'2099-11-17T18:00:00Z',ends_at:'2099-11-17T20:00:00Z',description:'Meet the teams shaping better health.',location:'Baltimore',links:[],media:[],venues:[]}
  await page.route('**/attendance',route=>route.fulfill({json:{event_id:'fixture-event',count:0,registered:false,attendees:[]}}))
  await page.route('**/company-votes/public',route=>route.fulfill({json:{available:false,closed:false,closes_at:null,companies:[]}}))
  await page.route('**/events/public/demo-day',route=>route.fulfill({json:event}))
  await page.route('**/presentations/submissions',route=>route.fulfill({json:{favoriteLimit:3,next:null,submissions:[
   {submission_id:'a',organization_id:'low',organization_name:'Anchor Health',organization_slug:'anchor-health',image_url:'/images/org-placeholder.svg',title:'Better recovery',summary:'A new approach to recovery.',status:'submitted',favorites:2,presenters:[{name:'Sam Rivera',photo:'/images/org-placeholder.svg'}]},
   {submission_id:'z',organization_id:'high',organization_name:'Harbor Research',organization_slug:'harbor-research',image_url:'/images/org-placeholder.svg',title:'Earlier diagnosis',summary:'Supporting better decisions.',status:'submitted',favorites:8,presenters:[{name:'Alex Morgan',photo:'/images/org-placeholder.svg'},{name:'Taylor Lee'}]},
  ]}}))
  const results=[]
  for(const width of [390,1440])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:1000});await page.goto(base+'/events/demo-day?brand=lifetech&viewer=visitor')
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme)
   const applicants=page.getByRole('region',{name:'Event submissions',exact:true})
   await expect(page.getByRole('tab',{name:'Info',exact:true})).toHaveAttribute('aria-selected','true')
   await expect(applicants.getByRole('heading',{name:'Applicants',exact:true})).toBeVisible()
   const cards=applicants.locator('.submission-voting-card');await expect(cards).toHaveCount(2)
   await expect(cards.first()).toContainText('Harbor Research');await expect(cards.last()).toContainText('Anchor Health')
   await expect(cards.first().locator('.submission-card-details')).toBeHidden()
   await expect(cards.first().locator('.submission-team img')).toBeVisible()
   await expect(cards.first().locator('.submission-presenter-summary')).toBeVisible()
   await expect(cards.first().locator('.submission-presenter-summary .public-event-registrant-avatar')).toHaveCount(2)
   await expect.poll(()=>cards.first().locator('.submission-team img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true)
   for(const avatar of await cards.first().locator('.submission-presenter-summary .public-event-registrant-avatar').all()){const box=await avatar.boundingBox();expect(Math.abs(box.width-box.height)).toBeLessThan(1)}
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
   await applicants.screenshot({path:join(output,`applicants-${theme}-${width}.png`)})
   await page.getByRole('tab',{name:'Submissions',exact:true}).click();await expect(applicants).toBeVisible();await expect(applicants.locator('.submission-voting-card').first()).toContainText('Harbor Research')
   await page.getByRole('tab',{name:'Poster',exact:true}).click();await expect(applicants).toHaveCount(0)
   results.push({width,theme,status:'passed'})
  }
  expect(errors).toEqual([]);await writeFile(join(output,'checks.json'),JSON.stringify(results,null,2))
  console.log('PASS: applicants visible on event Info, star ranking, company and shared-member avatars, Submissions/Poster tabs, desktop/mobile light/dark')
 }finally{await browser.close()}
}
