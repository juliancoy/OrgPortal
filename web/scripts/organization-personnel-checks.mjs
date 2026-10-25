import {chromium,expect} from '@playwright/test'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

export async function testOrganizationPersonnel(base,output){
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||existsSync('/usr/bin/google-chrome')?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/google-chrome'}:{})})
 try{
  const page=await browser.newPage()
  page.on('pageerror',error=>console.error('Personnel fixture:',error.stack))
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname
   if(path.endsWith('/public/fixture-org/personnel'))return route.fulfill({json:{people:[{id:'opaque-owner',name:'Alex Morgan',titles:[],photo_url:null,profile_slug:null,personnel_class:'organizer'},{id:'opaque-invitation',name:'Invited teammate',titles:[],photo_url:null,profile_slug:null,personnel_class:'public',pendingInvitation:true}]}})
   if(path.endsWith('/invitations'))return route.fulfill({json:{relationships:[],invitations:[{id:'private-invitation',email:'teammate@example.invalid',status:'pending',email_status:'sent',purpose:'member'}]}})
   if(path.endsWith('/scheme'))return route.fulfill({json:{scheme:'meetup'}})
   if(path.endsWith('/members'))return route.fulfill({json:[]})
   return route.fulfill({json:{classes:{},photos:{},relationships:[],motions:[]}})
  })
  await page.goto(base+'/organization-personnel?brand=lifetech')
  const grid=page.locator('.organization-board-grid')
  await expect(grid.locator('article')).toHaveCount(2)
  await expect(grid.getByRole('heading',{name:'Alex Morgan',exact:true})).toBeVisible()
  await expect(grid.getByRole('heading',{name:'Invited teammate',exact:true})).toBeVisible()
  await expect(grid.getByText('Pending invitation',{exact:true})).toBeVisible()
  await expect(grid).not.toContainText('teammate@example.invalid')
  for(const width of [390,1440]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:join(output,`organization-personnel-${width}.png`),fullPage:true})}
  await page.goto(base+'/organization-personnel?brand=lifetech&admin=1')
  await expect(grid.locator('article')).toHaveCount(2)
  await expect(grid.getByRole('heading',{name:'teammate@example.invalid',exact:true})).toBeVisible()
  await expect(grid.getByRole('heading',{name:'Invited teammate',exact:true})).toHaveCount(0)
  await expect(grid.getByText('Invitation sent. Awaiting acceptance.',{exact:true})).toBeVisible()
  await page.screenshot({path:join(output,'organization-personnel-admin.png'),fullPage:true})
  console.log('PASS: signup team appears in Personnel, pending status stays explicit, public email privacy, administrator details without duplicates, desktop/mobile')
 }finally{await browser.close()}
}
