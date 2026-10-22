// Real UI forms on the local Docker deployment; no token/cookie injection.
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const fixtures=JSON.parse(readFileSync(new URL('../../../bmoremedtech/.local/bots/medtech-local-bots.json',import.meta.url)))
const root=fileURLToPath(new URL('../../',import.meta.url))
const setup=spawnSync('python3',['scripts/provision-local-established-bots.py'],{cwd:root,encoding:'utf8'})
assert.equal(setup.status,0,'Established local fixtures must be available')
const base='https://localhost:8443'
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']})
async function context(){const c=await browser.newContext({ignoreHTTPSErrors:true,reducedMotion:'reduce'});await c.route('**/*',r=>new URL(r.request().url()).hostname==='localhost'?r.continue():r.abort());return c}
async function enter(page){
 await page.goto(base+'/ecosystem/network',{waitUntil:'domcontentloaded'})
 await Promise.race([page.locator('#login-email').waitFor({timeout:30000}),page.getByRole('link',{name:/^(Login|Log in|Sign in)$/i}).first().click().catch(async error=>{if(!await page.locator('#login-email').isVisible())throw error})])
 const email=page.getByRole('link',{name:'Continue with email',exact:true})
 await Promise.race([page.locator('#login-email').waitFor(),email.waitFor()])
 if(await email.isVisible())await email.click()
 await page.locator('#login-email').waitFor()
}
async function submit(page,bot){await page.locator('#login-email').fill(bot.email);await page.locator('#login-password').fill(bot.password);await page.getByRole('button',{name:'Sign in',exact:true}).click()}
try{
 const googleContext=await context()
 const googleEntry=await googleContext.request.get(base+'/pidp/auth/google/login?app=orgportal',{maxRedirects:0})
 if(googleEntry.status()===503){
  const page=await googleContext.newPage()
  await page.goto(base+'/pidp/auth/google/login?app=orgportal',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:'Google sign-in is not configured',exact:true})).toBeVisible()
  await page.getByRole('link',{name:'Continue with email',exact:true}).click()
  await expect(page.locator('#login-email')).toBeVisible()
  console.log('BLOCKED Google sign-in: no configured OAuth client; visible explanation and email fallback verified')
 }
 await googleContext.close()
 for(const [i,bot] of (process.argv.includes('--primary-only')?[]:fixtures.bots.entries())){
  const c=await context(),page=await c.newPage()
  console.log(`Starting bot ${i+1} browser clickthrough`)
  await enter(page);await submit(page,bot)
  await page.waitForURL(u=>u.pathname==='/ecosystem/network',{timeout:30000})
  await expect(page.getByRole('button',{name:'Open user menu',exact:true})).toBeVisible()
  assert.equal((await c.request.get(base+'/pidp/auth/session-token')).status(),200)
  await page.reload({waitUntil:'domcontentloaded'})
  await expect(page.getByRole('button',{name:'Open user menu',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Open user menu',exact:true}).click()
  await page.getByRole('menuitem',{name:'My Profile',exact:true}).click()
  await expect(page.getByRole('button',{name:'Open user menu',exact:true})).toBeVisible()
  assert(!new URL(page.url()).pathname.startsWith('/pidp/'))
  await page.getByRole('button',{name:'Open user menu',exact:true}).click()
  await page.getByRole('menuitem',{name:'Sign out',exact:true}).click()
  await expect.poll(async()=>(await c.request.get(base+'/pidp/auth/session-token')).status()).toBe(401)
  console.log(`PASS bot ${i+1}: password form → graph → reload → profile → sign out`)
  await c.close()
 }
 const c=await context(),page=await c.newPage();await enter(page)
 await page.getByText('Other sign-in options',{exact:true}).click()
 await page.getByRole('link',{name:'Sign in with a PIdP account',exact:true}).click()
 await submit(page,fixtures.bots[0])
 await expect(page.getByRole('link',{name:'Link my portal account',exact:true})).toBeVisible()
 await page.getByRole('link',{name:'Sign in to the portal separately',exact:true}).click()
 await expect(page.locator('#login-email')).toBeVisible({timeout:15000})
 await submit(page,fixtures.bots[0])
 await page.waitForURL(u=>u.pathname==='/ecosystem/network',{timeout:30000})
 await expect(page.getByRole('button',{name:'Open user menu',exact:true})).toBeVisible()
 console.log('PASS primary-account sign-in → explicit linking choice → separate member sign-in → graph; no automatic identity linking')
 await c.close()
}finally{await browser.close()}
