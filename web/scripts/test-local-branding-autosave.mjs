/** Real components, synthetic identity, local-only Docker writes. */
import {fixtureServer} from './fixture-server.mjs'
import {fixtureData} from './layout-review/data.mjs'
import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile,cp} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('..',import.meta.url)),out=fileURLToPath(new URL('../../artifacts/branding-autosave',import.meta.url))
await mkdir(out,{recursive:true});const {server,base}=await fixtureServer(root,out)
const container='orgportal-branding-autosave-check';let started=false
let portal={id:'fixture-site',organization_id:'fixture-org',slug:'fixture-org',hostname:'lifetech.fyi',name:'LifeTech',tagline:'Original tagline',accent_color:'#155e59',profile:'lifetech',brand_image_path:'/images/organization-themes/harbor-icon.webp',home_image_url:'/images/organization-themes/harbor-background.webp',home_url:'https://example.invalid',home_kind:'org',feature_config:{}}
const writes=[];let delayNext=false,failNext=false
try{
 const staticDir=out+'/docker';await mkdir(staticDir,{recursive:true})
 for(const [url,name] of [['/organization-branding','index.html'],['/fixture.js','fixture.js'],['/fixture.css','fixture.css']])await writeFile(staticDir+'/'+name,await(await fetch(base+url)).text())
 await cp(root+'/public/images',staticDir+'/images',{recursive:true});await writeFile(staticDir+'/default.conf','server { listen 80; root /usr/share/nginx/html; location / { try_files $uri /index.html; } }')
 const image=execFileSync('docker',['inspect','common-form-test-nginx-gateway','--format','{{.Config.Image}}'],{encoding:'utf8'}).trim()
 execFileSync('docker',['run','-d','--name',container,'-p','127.0.0.1:19481:80','-v',staticDir+':/usr/share/nginx/html:ro','-v',staticDir+'/default.conf:/etc/nginx/conf.d/default.conf:ro',image]);started=true
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']})
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}})
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname
  if(request.method()!=='GET'){
   if(!path.startsWith('/api/org/api/network/orgs/fixture-org'))throw Error('Write outside synthetic organization')
   if(path.endsWith('/media')){await route.fulfill({json:{media:[{url:'/images/organization-themes/postcapitalist-corporate-light-icon.svg'}]}});return}
   writes.push({method:request.method(),path,body:request.postDataJSON()})
   if(path.endsWith('/portal')){
    if(delayNext){delayNext=false;await new Promise(resolve=>setTimeout(resolve,800))}
    if(failNext){failNext=false;await route.fulfill({status:503,json:{message:'Synthetic temporary failure'}});return}
    const data=request.postDataJSON();portal={...portal,...data,feature_config:{...portal.feature_config,brandThemes:data.brandThemes}}
   }
   await route.fulfill({json:{ok:true}});return
  }
  await route.fulfill({json:path.endsWith('/branding')?{portal}:fixtureData(path,new URLSearchParams('admin=1'))})
 })
 await page.goto('http://127.0.0.1:19481/organization-branding?brand=lifetech')
 await expect(page.getByLabel('Organization theme')).toBeVisible();await page.waitForTimeout(700);expect(writes).toHaveLength(0)
 await expect(page.getByRole('button',{name:'Save branding',exact:true})).toHaveCount(0)
 await page.getByLabel('Organization theme').selectOption('postcapitalist-corporate-light')
 for(const img of await page.locator('.organization-brand-imagery img,.tenant-brand-asset img,.tenant-brand-lockup img,.portal-brand img').all())await expect(img).toHaveAttribute('src',/postcapitalist-corporate-light/)
 await expect(page.getByText('All changes saved.',{exact:true})).toBeVisible();expect(portal.feature_config.brandThemes.defaultTheme).toBe('postcapitalist-corporate-light')
 await page.getByLabel('Brand guide theme',{exact:true}).selectOption('botanical')
 await expect(page.getByLabel('Organization theme')).toHaveValue('botanical');await expect(page.getByText('All changes saved.',{exact:true})).toBeVisible()
 delayNext=true;await page.getByLabel('Tagline',{exact:true}).fill('First draft')
 await expect.poll(()=>writes.filter(write=>write.path.endsWith('/portal')&&write.body.tagline==='First draft').length).toBe(1)
 await page.getByLabel('Tagline',{exact:true}).fill('Latest draft preserved')
 await expect(page.getByText('All changes saved.',{exact:true})).toBeVisible();expect(portal.tagline).toBe('Latest draft preserved')
 failNext=true;await page.getByLabel('Tagline',{exact:true}).fill('Retry without losing my text')
 await expect(page.getByText('Synthetic temporary failure')).toBeVisible();await expect(page.getByLabel('Tagline',{exact:true})).toHaveValue('Retry without losing my text')
 await page.getByRole('button',{name:'Retry saving branding'}).click();await expect(page.getByText('All changes saved.',{exact:true})).toBeVisible();expect(portal.tagline).toBe('Retry without losing my text')
 await page.getByLabel('Organization theme').selectOption('postcapitalist-corporate-light');await expect(page.getByText('All changes saved.',{exact:true})).toBeVisible()
 await page.reload();await expect(page.getByLabel('Organization theme')).toHaveValue('postcapitalist-corporate-light');await expect(page.getByLabel('Tagline',{exact:true})).toHaveValue('Retry without losing my text')
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1100});await page.waitForTimeout(200);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.locator('.organization-brand-editor').scrollIntoViewIfNeeded();await page.locator('.organization-brand-editor').screenshot({path:out+`/editor-${width}.png`})
 }
 await page.getByLabel('Icon image',{exact:true}).setInputFiles({name:'fixture.gif',mimeType:'image/gif',buffer:Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')});await expect(page.locator('.tenant-brand-asset-icon img')).toHaveAttribute('src',/^blob:/);await expect(page.getByText('All changes saved.',{exact:true})).toBeVisible();expect(portal.feature_config.brandThemes.themes.find(theme=>theme.id==='postcapitalist-corporate-light').imagery.icon).toContain('postcapitalist-corporate-light-icon.svg')
 await page.getByLabel('Tagline',{exact:true}).fill('Saved while leaving the editor');await page.getByRole('link',{name:'Terms & privacy',exact:true}).click();await expect.poll(()=>portal.tagline).toBe('Saved while leaving the editor')
 await page.goto('http://127.0.0.1:19481/organization-branding?brand=lifetech');await expect(page.getByLabel('Tagline',{exact:true})).toHaveValue('Saved while leaving the editor');delayNext=true;await page.getByLabel('Tagline',{exact:true}).fill('Slow save before leaving');await expect.poll(()=>writes.filter(write=>write.path.endsWith('/portal')&&write.body.tagline==='Slow save before leaving').length).toBe(1);await page.getByLabel('Tagline',{exact:true}).fill('Newest edit while leaving during save');await page.getByRole('link',{name:'Terms & privacy',exact:true}).click();await expect.poll(()=>portal.tagline).toBe('Newest edit while leaving during save')
 const before=writes.length;await page.goto('http://127.0.0.1:19481/organization-branding?readonly=1');await expect(page.getByLabel('Organization theme')).toHaveCount(0);await page.waitForTimeout(700);expect(writes).toHaveLength(before)
 await writeFile(out+'/result.json',JSON.stringify({passed:true,isolatedDocker:true,syntheticDataOnly:true,checks:['No write on load','Automatic save without Save button','All branding images update immediately','Both theme selectors synchronized','New edits survive in-flight saves','Visible failure and retry preserves input','Reload retains branding','Uploaded image previews update the guide before saving','Leaving the editor flushes pending edits','Read-only viewers cannot save','Desktop/mobile without horizontal overflow']},null,2))
 }finally{await browser.close()}
}finally{server.close();if(started)execFileSync('docker',['rm','-f',container])}
console.log('PASS: branding autosave and imagery browser checks')
