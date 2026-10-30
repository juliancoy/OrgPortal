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
   const cards=applicants.locator('.applicant-row');await expect(cards).toHaveCount(2)
   await expect(cards.first()).toContainText('Harbor Research');await expect(cards.last()).toContainText('Anchor Health')
   await expect(applicants.getByText('Supporting better decisions.')).toHaveCount(0)
   const open=cards.first().locator('.applicant-open')
   await applicants.screenshot({path:join(output,`applicants-${theme}-${width}.png`)})
   if(width>=900){await open.hover();const hover=page.locator('.applicant-hover');await expect(hover).toBeVisible();await hover.hover();await page.waitForTimeout(400);await expect(hover).toBeVisible();await page.screenshot({path:join(output,`applicant-hover-${theme}.png`)});await page.keyboard.press('Escape');await expect(hover).toHaveCount(0)}
   await open.click();const modal=page.locator('dialog.applicant-modal');await expect(modal).toBeVisible()
   await expect(modal).toContainText('Alex Morgan');await expect(modal).toContainText('Taylor Lee')
   await expect(modal.getByRole('link',{name:'View company'})).toHaveAttribute('href','/orgs/harbor-research')
   await page.screenshot({path:join(output,`applicant-modal-${theme}-${width}.png`)})
   await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);await expect(open).toBeFocused()
   await page.keyboard.press('Enter');await expect(modal).toBeVisible();await modal.getByRole('button',{name:'Close applicant details'}).click();await expect(open).toBeFocused()
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
   await page.getByRole('tab',{name:'Submissions',exact:true}).click();await expect(applicants).toBeVisible();await expect(applicants.locator('.applicant-row').first()).toContainText('Harbor Research')
   await page.getByRole('tab',{name:'Poster',exact:true}).click();await expect(applicants).toHaveCount(0)
   results.push({width,theme,status:'passed'})
  }
  await page.unroute('**/presentations/submissions')
  await page.goto(base+'/submissions?brand=lifetech&submissionReview=1')
  await page.locator('.applicant-open').first().click()
  const managed=page.locator('dialog.applicant-modal')
  await managed.getByRole('button',{name:'Delete application',exact:true}).click()
  await expect(managed.locator('dialog')).toBeVisible()
  await managed.locator('dialog').getByRole('button',{name:'Cancel',exact:true}).click()
  await expect(managed).toBeVisible()
  await managed.getByLabel('Add submission attachments',{exact:true}).setInputFiles({name:'research.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic research attachment')})
  await expect(managed.getByRole('button',{name:'Upload attachments'})).toBeVisible()
  page.once('dialog',dialog=>dialog.dismiss())
  await managed.getByRole('button',{name:'Close applicant details'}).click()
  await expect(managed).toBeVisible();await expect(managed).toContainText('research.txt')
  page.once('dialog',dialog=>dialog.accept())
  await page.keyboard.press('Escape');await expect(managed).toHaveCount(0)
  expect(errors).toEqual([]);await writeFile(join(output,'checks.json'),JSON.stringify(results,null,2))
  console.log('PASS: applicants visible on event Info, star ranking, compact rows, hover persistence, modal presenters, keyboard focus, Submissions/Poster tabs, desktop/mobile light/dark')
 }finally{await browser.close()}
}
