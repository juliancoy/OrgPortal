import {chromium,expect} from '@playwright/test'
import {mkdir,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {existsSync} from 'node:fs'
export async function testOrganizationProfile(base,output,contactOutput=output){
 await mkdir(output,{recursive:true})
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||existsSync('/usr/bin/google-chrome')?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/google-chrome'}:{})})
 const org={id:'fixture-org',slug:'fixture-org',name:'Harbor Care',description:'Advance care planning with patients, families, and care teams.',image_url:'/images/organization-themes/harbor-avatar.webp',tags:['Health'],links:[],membership_count:2,upcoming_events_count:0,candidates:[{event_id:'demo',event_slug:'demo-day',event_title:'LifeTech Demo Day',submission_id:'application',title:'Care planning',stars:7}]}
 const portal={id:'fixture-site',organization_id:org.id,hostname:'fixture.example',slug:org.slug,name:org.name,tagline:'Care that starts with a conversation',brand_image_path:'/images/organization-themes/harbor-icon.webp',home_image_url:'/images/organization-themes/harbor-background.webp'}
 try{
  const captures=[]
  for(const viewer of ['visitor','member','owner','operator']){
   const page=await browser.newPage();let eventRequests=0,ownStars=viewer==='member'?['other']:[],starWrites=0,failStar=false;const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(viewer,e.stack)})
   await page.route('**/api/**',route=>{
    const url=new URL(route.request().url()),path=url.pathname
    let json=[]
    if(path.includes('/presentations/favorites/')){starWrites++;if(failStar)return route.fulfill({status:503,json:{message:'Could not save your star.'}});const id=decodeURIComponent(path.split('/').at(-1)),selected=route.request().postDataJSON().selected;ownStars=selected?[...new Set([...ownStars,id])]:ownStars.filter(item=>item!==id);return route.fulfill({json:{saved:true}})}
    if(path.endsWith('/presentations/submissions'))return route.fulfill({json:url.searchParams.has('after')?{submissions:[{submission_id:'other',title:'Other pitch',organization_name:'Other team',favorites:1}],next:null}:{submissions:[],next:'second-page'}})
    if(path.endsWith('/orgs/public/fixture-org'))json=org
    else if(path.endsWith('/branding')||path.endsWith('/portal'))json={portal}
    else if(path.endsWith('/admin/me'))json={is_sysadmin:viewer==='operator'}
    else if(path.endsWith('/orgs')&&url.searchParams.has('mine'))json=viewer==='owner'?[{...org,my_role:'administrator'}]:[]
    else if(path.endsWith('/membership'))json={role:'member',status:'active',membership_count:2}
    else if(path.endsWith('/presentations/favorites'))json={favorites:ownStars,limit:1}
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
   if(viewer==='visitor')await expect(profile.getByRole('link',{name:'Sign in to star Care planning; 7 stars'})).toHaveAttribute('href',/users\/login/)
   else await expect(profile.getByRole('button',{name:'Star Care planning; 7 stars',exact:true})).toBeEnabled()
   await expect(profile.locator('.organization-candidates')).toContainText('Candidate')
   if(viewer==='member'){
    const star=profile.locator('.organization-candidate-stars'),quota=profile.getByRole('region',{name:'Manage your stars'})
    await star.click();await expect(quota).toContainText('You’ve used all 1 star');expect(starWrites).toBe(0)
    await expect(quota.getByText('Other team',{exact:true})).toBeVisible()
    await page.setViewportSize({width:390,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.screenshot({path:join(output,'profile-star-quota.png'),fullPage:true})
    await quota.getByRole('button',{name:'Keep my stars'}).click();expect(ownStars).toEqual(['other'])
    await star.click();await quota.getByRole('button',{name:'Remove star: Other pitch',exact:true}).click();await expect(quota).toHaveCount(0);expect(ownStars).toEqual([])
    await star.click();await expect(star).toHaveAttribute('aria-pressed','true');await expect(star).toHaveText('8');expect(ownStars).toEqual(['application'])
    await star.click();await expect(star).toHaveAttribute('aria-pressed','false');await expect(star).toHaveText('7');expect(ownStars).toEqual([])
    failStar=true;await star.click();await expect(profile.getByRole('alert').filter({hasText:'Could not save your star.'})).toBeVisible();await expect(star).toHaveText('7');await expect(star).toHaveAttribute('aria-pressed','false');expect(ownStars).toEqual([])
   }

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
  const votePage=await browser.newPage();let chosen=['first'],failRemoval=true
  await votePage.route('**/presentations/submissions**',route=>route.fulfill({json:{favoriteLimit:1,next:null,submissions:['first','second'].map(id=>({submission_id:id,organization_id:id,organization_slug:id,organization_name:id==='first'?'First team':'Second team',title:id==='first'?'First pitch':'Second pitch',summary:'A test pitch',status:'submitted',favorites:chosen.includes(id)?1:0,presenters:[],attachments:[],image_url:null}))}}))
  await votePage.route('**/presentations/favorites**',route=>{
   if(route.request().method()==='PUT'){const id=decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)),selected=route.request().postDataJSON().selected;if(!selected&&failRemoval)return route.fulfill({status:503,json:{message:'Could not remove this star.'}});chosen=selected?[...chosen,id]:chosen.filter(item=>item!==id);return route.fulfill({json:{saved:true}})}
   return route.fulfill({json:{favorites:chosen,limit:1}})
  })
  await votePage.goto(base+'/submissions?brand=lifetech&submissionReview=1')
  const choose=votePage.getByRole('button',{name:'Favorite: Second pitch',exact:true}),quota=votePage.getByRole('region',{name:'Manage your stars'})
  await expect(choose).toBeEnabled();await choose.click();await expect(quota).toContainText('First team')
  await quota.getByRole('button',{name:'Remove star: First pitch',exact:true}).click();await expect(quota.getByRole('alert').filter({hasText:'Could not remove this star.'})).toBeVisible();expect(chosen).toEqual(['first'])
  failRemoval=false;await quota.getByRole('button',{name:'Remove star: First pitch',exact:true}).click();await expect(quota).toHaveCount(0);expect(chosen).toEqual([])
  await choose.click();await expect(votePage.getByRole('button',{name:'Remove favorite: Second pitch',exact:true})).toHaveAttribute('aria-pressed','true');expect(chosen).toEqual(['second'])
  await votePage.close()
  const sheet=await browser.newPage({viewport:{width:1500,height:1000}})
  await sheet.setContent('<style>body{font:14px sans-serif;background:#ddd;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0}img{width:100%;height:900px;object-fit:contain;object-position:top}</style>'+(await Promise.all(captures.map(async name=>`<figure><figcaption>${name}</figcaption><img src="data:image/png;base64,${(await readFile(join(output,name))).toString('base64')}"></figure>`))).join(''))
  await sheet.screenshot({path:join(contactOutput,'organization-profile-contact.png'),fullPage:true})
  console.log('PASS: organization tabs, lazy events, signup people, visitor/member/owner/operator permissions, keyboard navigation, single heading, responsive light/dark layouts')
 }finally{await browser.close()}
}
