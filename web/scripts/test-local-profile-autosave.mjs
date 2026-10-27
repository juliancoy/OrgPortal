/** Local Docker only: real profile, inline-field and organization settings components. */
import {fixtureServer} from './fixture-server.mjs'
import {fixtureData} from './layout-review/data.mjs'
import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile,cp} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('..',import.meta.url)),out=fileURLToPath(new URL('../../artifacts/profile-autosave',import.meta.url))
await mkdir(out,{recursive:true});const {server,base}=await fixtureServer(root,out)
const container='orgportal-profile-autosave-check';let started=false
let identity={full_name:'Alex Morgan',identity_data:{bio:'Existing bio',avatar_url:'https://example.invalid/photo.png',city:'Baltimore'}}
let contact={user_id:'fixture-member',user_name:'Alex Morgan',slug:'alex',enabled:true,links:[],headline:'Original headline',public_visibility:{}}
let org={id:'fixture-org',slug:'fixture-org',name:'Example organization',description:'Original description',image_url:null,links:[],tags:[],my_role:'owner',membership_count:1}
let portal={id:'fixture-site',organization_id:'fixture-org',slug:'fixture-org',name:'Example organization',tagline:'Original tagline',hostname:'example.invalid',accent_color:'#123456',home_kind:'org',features:['directory','events','chat','research'],brand_image_path:'https://example.invalid/logo.svg',home_image_url:'https://example.invalid/cover.png'}
const writes=[];let delayNext=false,failNext=false
try{
 const staticDir=out+'/docker';await mkdir(staticDir,{recursive:true})
 for(const [url,name] of [['/profile-editor','index.html'],['/fixture.js','fixture.js'],['/fixture.css','fixture.css']])await writeFile(staticDir+'/'+name,await(await fetch(base+url)).text())
 await cp(root+'/public/images',staticDir+'/images',{recursive:true});await cp(root+'/public/assets/fonts',staticDir+'/assets/fonts',{recursive:true});await writeFile(staticDir+'/default.conf','server { listen 80; root /usr/share/nginx/html; location / { try_files $uri /index.html; } }')
 const image=execFileSync('docker',['inspect','common-form-test-nginx-gateway','--format','{{.Config.Image}}'],{encoding:'utf8'}).trim()
 execFileSync('docker',['run','-d','--name',container,'-p','127.0.0.1:19483:80','-v',staticDir+':/usr/share/nginx/html:ro','-v',staticDir+'/default.conf:/etc/nginx/conf.d/default.conf:ro',image]);started=true
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']})
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message))
 const routeApi=async route=>{
  const request=route.request(),path=new URL(request.url()).pathname
  let data=fixtureData(path,new URLSearchParams('admin=1'))
  if(path.endsWith('/page-view')){await route.fulfill({json:{counted:true}});return}
  if(request.method()!=='GET'){
   if(!['/pidp/auth/me','/api/org/api/network/contact/me','/api/org/api/network/orgs/fixture-org','/api/org/api/network/orgs/fixture-org/portal'].includes(path))throw Error('Write outside synthetic fixtures: '+path)
   const body=request.postDataJSON();writes.push({path,body})
   if(path==='/pidp/auth/me'){
    if(delayNext){delayNext=false;await new Promise(resolve=>setTimeout(resolve,900))}
    if(failNext){failNext=false;await route.fulfill({status:503,json:{error:'Temporary failure'}});return}
    identity={...identity,...('full_name' in body?{full_name:body.full_name}:{}),identity_data:{...identity.identity_data,...body}};data=identity
   }else if(path.endsWith('/contact/me')){contact={...contact,...body,user_name:identity.full_name};data=contact}
   else if(path.endsWith('/portal')){portal={...portal,...body};data={portal}}
   else{org={...org,...body};data=org}
  }else if(path.endsWith('/subscribers'))data={items:[],has_more:false,exports_enabled:false}
  else if(path.endsWith('/segments')||path.endsWith('/audit')||path.endsWith('/feedback/review'))data=[]
  else if(path==='/pidp/auth/me')data=identity
  else if(path.endsWith('/contact/me'))data=contact
  else if(path.endsWith('/admin/me'))data={is_sysadmin:true}
  else if(path==='/api/org/api/network/orgs')data=[org]
  else if(path.endsWith('/orgs/public/fixture-org'))data=org
  else if(path.endsWith('/branding'))data={portal}
  else if(path.endsWith('/portal'))data={portal}
  await route.fulfill({json:data})
 }
 await page.route('**/api/**',routeApi);await page.route('**/pidp/**',routeApi)
 await page.goto('http://127.0.0.1:19483/profile-editor');await expect(page.getByLabel('Full name',{exact:true})).toHaveValue('Alex Morgan');await page.waitForTimeout(700);expect(writes).toHaveLength(0)
 await expect(page.getByRole('button',{name:'Save profile',exact:true})).toHaveCount(0)
 delayNext=true;await page.getByLabel('Full name',{exact:true}).fill('First name draft');await expect.poll(()=>writes.filter(write=>write.body.full_name==='First name draft').length).toBe(1)
 await page.getByLabel('Full name',{exact:true}).fill('Latest name draft');await expect(page.getByText('Profile saved.',{exact:true})).toBeVisible();expect(identity.full_name).toBe('Latest name draft')
 for(const write of writes.filter(write=>write.path==='/pidp/auth/me')){expect(write.body).not.toHaveProperty('avatar_url');expect(write.body).not.toHaveProperty('bio');expect(write.body).not.toHaveProperty('city')}
 failNext=true;await page.getByLabel('Full name',{exact:true}).fill('Retry retained name');await expect(page.getByText('Could not save profile changes. Please retry.')).toBeVisible();await page.getByRole('button',{name:'Retry saving',exact:true}).click();await expect(page.getByText('Profile saved.',{exact:true})).toBeVisible();expect(identity.full_name).toBe('Retry retained name')
 await page.getByLabel("I'm running for office",{exact:true}).check();await page.getByLabel('Office / position',{exact:true}).fill('Community representative');await expect(page.getByText('Profile saved.',{exact:true})).toBeVisible();expect(identity.identity_data.office_title).toBe('Community representative')
 await page.getByText('Address',{exact:true}).click();await page.getByLabel('City',{exact:true}).fill('New saved city');await expect.poll(()=>identity.identity_data.city).toBe('New saved city')
 for(const width of [1440,390]){await page.setViewportSize({width,height:1100});await page.locator('.profile-editor-section-header').scrollIntoViewIfNeeded();await page.screenshot({path:out+`/profile-${width}.png`})}
 await page.goto('http://127.0.0.1:19483/personal-details');await page.getByRole('button',{name:'Edit physiological (now)',exact:true}).click();delayNext=true;await page.getByLabel('Physiological (now)',{exact:true}).fill('4');await page.getByRole('button',{name:'Edit safety (now)',exact:true}).click();await page.getByLabel('Safety (now)',{exact:true}).fill('5');await expect.poll(()=>identity.identity_data.maslow_now).toMatchObject({physiological:4,safety:5})
 await page.goto('http://127.0.0.1:19483/inline-profile-review');await page.getByRole('button',{name:'Edit headline',exact:true}).click();await page.getByLabel('Headline',{exact:true}).fill('Automatically saved headline');await expect(page.getByText('Headline saved.',{exact:true})).toBeVisible();await expect.poll(()=>contact.headline).toBe('Automatically saved headline');await expect(page.getByRole('button',{name:'Save headline'})).toHaveCount(0)
 await page.getByLabel('Headline',{exact:true}).fill('Saved on navigation');await page.getByRole('link',{name:'Terms & privacy',exact:true}).click();await expect.poll(()=>contact.headline).toBe('Saved on navigation')
 await page.goto('http://127.0.0.1:19483/orgs/fixture-org?tab=settings');await expect(page.getByLabel('Organization name',{exact:true})).toHaveValue(org.name);const count=writes.length;await page.waitForTimeout(700);expect(writes).toHaveLength(count)
 await expect(page.getByRole('button',{name:'Save organization settings',exact:true})).toHaveCount(0)
 await page.getByLabel('Organization name',{exact:true}).fill('Autosaved organization name');await expect(page.getByText('Organization settings saved.',{exact:true})).toBeVisible();expect(org.name).toBe('Autosaved organization name');expect(portal.accent_color).toBe('#123456')
 await page.getByLabel('Tagline',{exact:true}).fill('Autosaved organization tagline');await expect(page.getByText('Organization settings saved.',{exact:true})).toBeVisible();expect(portal.tagline).toBe('Autosaved organization tagline');expect(portal.accent_color).toBe('#123456');expect(portal.features).toContain('research')
 await page.reload();await expect(page.getByLabel('Organization name',{exact:true})).toHaveValue('Autosaved organization name');await expect(page.getByLabel('Tagline',{exact:true})).toHaveValue('Autosaved organization tagline')
 expect(errors).toEqual([])
 await writeFile(out+'/result.json',JSON.stringify({passed:true,isolatedDocker:true,syntheticDataOnly:true,checks:['No writes on hydration','Profile changes autosave','New edits survive slow responses','Profile saves patch only edited fields','Visible error and retry','Campaign details autosave','Concurrent satisfaction fields preserve both edits','Inline fields autosave without Save buttons','Navigation flushes pending edits','Organization names and portal settings autosave','Unrelated organization branding/features preserved','Reload preserves edits']},null,2))
 }finally{await browser.close()}
}finally{server.close();if(started)execFileSync('docker',['rm','-f',container])}
console.log('PASS: profile, inline fields and organization settings autosave')
