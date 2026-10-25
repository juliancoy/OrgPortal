import {chromium,expect} from '@playwright/test'
import {mkdir,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {existsSync} from 'node:fs'
export async function testOrganizationProfile(base,output,contactOutput=output){
 await mkdir(output,{recursive:true})
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||existsSync('/usr/bin/google-chrome')?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/google-chrome'}:{})})
 const org={id:'fixture-org',slug:'fixture-org',name:'Harbor Care',description:'Advance care planning with patients, families, and care teams.',image_url:'/images/organization-themes/harbor-avatar.webp',tags:['Health'],links:[],membership_count:2,upcoming_events_count:0}
 const portal={id:'fixture-site',organization_id:org.id,hostname:'fixture.example',slug:org.slug,name:org.name,tagline:'Care that starts with a conversation',brand_image_path:'/images/organization-themes/harbor-icon.webp',home_image_url:'/images/organization-themes/harbor-background.webp'}
 try{
  const captures=[]
  for(const viewer of ['visitor','member','owner','operator']){
   const page=await browser.newPage();let eventRequests=0;const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(viewer,e.stack)})
   await page.route('**/api/**',route=>{
    const url=new URL(route.request().url()),path=url.pathname
    let json=[]
    if(path.endsWith('/orgs/public/fixture-org'))json=org
    else if(path.endsWith('/branding')||path.endsWith('/portal'))json={portal}
    else if(path.endsWith('/admin/me'))json={is_sysadmin:viewer==='operator'}
    else if(path.endsWith('/orgs')&&url.searchParams.has('mine'))json=viewer==='owner'?[{...org,my_role:'administrator'}]:[]
    else if(path.endsWith('/membership'))json={role:'member',status:'active',membership_count:2}
    else if(path.endsWith('/follow'))json={following:false}
    else if(path.endsWith('/events')){eventRequests++;json=[]}
    else if(path.endsWith('/personnel'))json={people:[{id:'person-one',name:'Alex Morgan',titles:[],personnel_class:'organizer'},{id:'person-two',name:'Invited teammate',titles:[],personnel_class:'public',pendingInvitation:true}]}
    else if(path.endsWith('/subscribers'))json={items:[],has_more:false,exports_enabled:false}
    else if(path.endsWith('/motions'))json={motions:[]}
    else if(path.endsWith('/scheme'))json={scheme:'meetup'}
    else if(path.endsWith('/invitations'))json={relationships:[],invitations:[]}
    return route.fulfill({json})
   })
   await page.goto(`${base}/orgs/fixture-org?brand=lifetech&viewer=${viewer}`)
   const profile=page.locator('.organization-profile')
   await expect(profile.getByRole('heading',{level:1})).toHaveText(org.name)
   await expect(profile.getByRole('tab',{name:'About',exact:true})).toHaveAttribute('aria-selected','true')
   await expect(profile.locator('.organization-profile-cover img')).toHaveAttribute('src',portal.home_image_url)
   expect(eventRequests).toBe(0)
   await expect(profile.locator('.portal-card .portal-card')).toHaveCount(0)
   await expect(profile.locator('.peer-organizations')).toHaveCount(0)
   const manager=viewer==='owner'||viewer==='operator'
   await expect(profile.getByRole('tab',{name:'Settings',exact:true})).toHaveCount(manager?1:0)
   if(viewer==='visitor')for(const mode of ['light','dark'])for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.evaluate(mode=>document.documentElement.dataset.theme=mode,mode)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await expect.poll(()=>profile.locator('.organization-profile-cover img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true)
    const name=`profile-${mode}-${width}.png`;await page.screenshot({path:join(output,name),fullPage:true});captures.push(name)
   }
   await profile.getByRole('tab',{name:'Events',exact:true}).click();await expect.poll(()=>eventRequests).toBeGreaterThan(0)
   await profile.getByRole('tab',{name:'People',exact:true}).click();await expect(profile.getByRole('heading',{name:'Alex Morgan',exact:true})).toBeVisible();await expect(profile.getByRole('heading',{name:'Invited teammate',exact:true})).toHaveCount(manager?0:1)
   await profile.getByRole('tab',{name:'Community',exact:true}).click();await expect(profile.locator('#org-panel-community')).toBeVisible()
   await profile.getByRole('tab',{name:'Branding',exact:true}).click();await expect(profile.getByRole('heading',{name:'Edit organization branding',exact:true})).toHaveCount(manager?1:0)
   await expect(profile.getByRole('heading',{level:1})).toHaveCount(1)
   if(manager){await profile.getByRole('tab',{name:'Settings',exact:true}).click();await expect(profile.locator('#org-panel-settings')).toBeVisible()}
   await profile.getByRole('tab',{name:'About',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(profile.getByRole('tab',{name:'People',exact:true})).toHaveAttribute('aria-selected','true');await page.keyboard.press('Home');await expect(profile.getByRole('tab',{name:'About',exact:true})).toHaveAttribute('aria-selected','true')
   expect(errors).toEqual([]);await page.close()
  }
  const sheet=await browser.newPage({viewport:{width:1500,height:1000}})
  await sheet.setContent('<style>body{font:14px sans-serif;background:#ddd;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0}img{width:100%;height:900px;object-fit:contain;object-position:top}</style>'+(await Promise.all(captures.map(async name=>`<figure><figcaption>${name}</figcaption><img src="data:image/png;base64,${(await readFile(join(output,name))).toString('base64')}"></figure>`))).join(''))
  await sheet.screenshot({path:join(contactOutput,'organization-profile-contact.png'),fullPage:true})
  console.log('PASS: organization tabs, lazy events, signup people, visitor/member/owner/operator permissions, keyboard navigation, single heading, responsive light/dark layouts')
 }finally{await browser.close()}
}
