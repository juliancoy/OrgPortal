import {chromium,expect} from '@playwright/test'
import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {mkdir,readFile} from 'node:fs/promises'

export async function testOrganizationBranding(base,output,contactOutput=output){
 await mkdir(output,{recursive:true})
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||existsSync('/usr/bin/google-chrome')?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/google-chrome'}:{})})
 try{
 const page=await browser.newPage();page.on('pageerror',error=>console.error(error));let portal=null,patches=[],uploads=0,imageBytes=null
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(path.includes('/media/test-'))return route.fulfill({contentType:'image/png',body:imageBytes})
  if(path.endsWith('/branding'))return route.fulfill({json:{portal}})
  if(path.endsWith('/media')){uploads++;expect(request.headers()['content-type']).toContain('multipart/form-data');return route.fulfill({json:{media:[{url:`/api/network/orgs/public/fixture-org/media/test-${uploads}`}]}})}
  if(request.method()==='PATCH'){patches.push(request.postDataJSON());return route.fulfill({json:{}})}
  if(path.endsWith('/portal')){portal={id:'fixture-site',hostname:'fixture.example',...request.postDataJSON(),feature_config:{brandThemes:request.postDataJSON().brandThemes}};return route.fulfill({json:{portal}})}
  if(path.endsWith('/presentations/public'))return route.fulfill({json:{enabled:true,closed:false}})
  if(path.includes('/presentations/team/'))return route.fulfill({json:{people:[]}})
  if(path.endsWith('/orgs'))return route.fulfill({json:request.method()==='POST'?{id:'new-team',name:'New team'}:[{id:'fixture-org',name:'Existing team',my_role:'administrator'}]})
  return route.fulfill({json:{}})
 })
 await page.goto(base+'/organization-branding?brand=lifetech')
 await expect(page.getByRole('heading',{name:'Edit organization branding'})).toBeVisible()
 await expect(page.getByLabel('Tagline',{exact:true})).toHaveValue('')
 await expect(page.locator('main')).not.toContainText('Coding a New Economy')
 await page.getByLabel('Organization theme',{exact:true}).selectOption('midnight')
 await expect(page.getByAltText('icon preview')).toHaveAttribute('src','/images/organization-themes/midnight-icon.webp')
 await expect(page.getByAltText('background preview')).toHaveAttribute('src','/images/organization-themes/midnight-background.webp')
 await page.getByLabel('Tagline',{exact:true}).fill('Care comes first')
 await page.getByLabel('Brand color',{exact:true}).fill('#236789')
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=100;c.getContext('2d').fillRect(20,20,60,60);return c.toDataURL().split(',')[1]})
 imageBytes=Buffer.from(png,'base64')
 await page.getByLabel('Avatar image',{exact:true}).setInputFiles({name:'transparent.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')})
 await page.getByRole('button',{name:'Save branding',exact:true}).click()
 await expect(page.getByText('Branding saved.',{exact:true})).toBeVisible()
 expect(uploads).toBe(1);expect(portal.brandThemes.defaultTheme).toBe('midnight');expect(portal.brand_image_path).toContain('/midnight-icon.webp');expect(portal.home_image_url).toContain('/midnight-background.webp');expect(portal.brand_image_path).not.toBe(patches[0].image_url);expect(patches[0].image_url).toContain('/api/org/api/network/orgs/public/fixture-org/media/test')
 expect(portal.tagline).toBe('Care comes first');expect(portal.accent_color).toBe('#236789')
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:join(output,`organization-branding-${width}.png`),fullPage:true})}
 await page.reload();await expect(page.getByLabel('Organization theme',{exact:true})).toHaveValue('midnight');await expect(page.getByLabel('Tagline',{exact:true})).toHaveValue('Care comes first')
 await page.getByLabel('Icon image',{exact:true}).setInputFiles({name:'icon.png',mimeType:'image/png',buffer:imageBytes})
 await page.getByLabel('Background image',{exact:true}).setInputFiles({name:'cover.png',mimeType:'image/png',buffer:imageBytes})
 await page.getByRole('button',{name:'Save branding',exact:true}).click();await expect(page.getByText('Branding saved.',{exact:true})).toBeVisible()
 expect(uploads).toBe(3);expect(portal.brand_image_path).toContain('/media/test-2');expect(portal.home_image_url).toContain('/media/test-3');expect(patches.at(-1).image_url).toContain('/media/test-1')
 await page.goto(base+'/organization-branding?readonly=1')
 await expect(page.getByRole('heading',{name:'Anchor Advance Care',exact:true})).toBeVisible()
 await expect(page.getByRole('form',{name:'Edit organization branding'})).toHaveCount(0)
 await page.goto(base+'/presentation-form')
 await expect(page.getByLabel('Applying as')).toHaveValue('fixture-org')
 await expect(page.getByLabel('Team image (optional)',{exact:true})).toBeVisible()
 await page.getByLabel('Applying as').selectOption('')
 await expect(page.getByLabel('Tagline',{exact:true})).toHaveValue('')
 await expect(page.getByLabel('Team image (optional)',{exact:true})).toBeVisible()
 await page.getByLabel('Presentation title',{exact:true}).fill('Care research')
 await page.getByLabel('Abstract',{exact:true}).fill('A presentation about care.')
 await page.getByLabel('Team name',{exact:true}).fill('New team')
 await page.getByLabel('Tagline',{exact:true}).fill('Submitted team identity')
 await page.getByLabel('Brand color',{exact:true}).fill('#123456')
 await page.screenshot({path:join(output,'presentation-branding.png'),fullPage:true})
 await page.getByRole('button',{name:'Submit application',exact:true}).click()
 await expect(page.getByText('Application submitted to the event organizers.',{exact:true})).toBeVisible()
 expect(portal.tagline).toBe('Submitted team identity');expect(portal.accent_color).toBe('#123456')
 const contact=await browser.newPage({viewport:{width:1280,height:1000}})
 const names=['organization-branding-390.png','organization-branding-1440.png','presentation-branding.png']
 const tiles=await Promise.all(names.map(async name=>`<figure><figcaption>${name}</figcaption><img src="data:image/png;base64,${(await readFile(join(output,name))).toString('base64')}"/></figure>`))
 await contact.setContent('<style>body{background:#e8edf2;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;font:14px Arial}figure{margin:0}img{width:100%;height:920px;object-fit:contain;object-position:top}figcaption{padding:10px}</style>'+tiles.join(''))
 await contact.screenshot({path:join(contactOutput,'contact-organization-branding.png'),fullPage:true})
 // Exercise the real parent permission gate with no organization memberships.
 for (const authority of [true,false,'true',null]) {
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname
   if(path.endsWith('/admin/me'))return route.fulfill(authority===null?{status:403,json:{error:'Denied'}}:{json:{is_sysadmin:authority}})
   if(path.endsWith('/orgs/public/fixture-org'))return route.fulfill({json:{id:'fixture-org',slug:'fixture-org',name:'Anchor Advance Care',description:'Care team',tags:[],links:[],membership_count:2,upcoming_events_count:0}})
   if(path.endsWith('/branding')||path.endsWith('/portal'))return route.fulfill({json:{portal}})
   if(path.endsWith('/membership'))return route.fulfill({json:{membership:null}})
   return route.fulfill({json:[]})
  })
  await page.goto(base+'/orgs/fixture-org?tab=branding&brand=lifetech')
  await expect(page.locator('.portal-org-page')).toBeVisible()
  if(authority===true){
   await expect(page.getByRole('form',{name:'Edit organization branding'})).toBeVisible()
   await expect(page.getByLabel('Organization theme',{exact:true})).toBeVisible()
   await expect(page.getByLabel('Icon image',{exact:true})).toBeVisible()
  }else{
   await expect(page.getByRole('heading',{name:'Portal palette',exact:true})).toBeVisible()
   await expect(page.getByRole('form',{name:'Edit organization branding'})).toHaveCount(0)
  }
  await page.unroute('**/api/**')
 }
 console.log('PASS: organization branding edit/upload/reload, neutral tagline, read-only permissions, desktop/mobile, initial application branding and existing-team image')
 }finally{await browser.close()}
}
