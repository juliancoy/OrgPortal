import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron, chromium } from '@playwright/test'
import electron from 'electron'
import { electronEnvironment } from './runtime.mjs'

const output=fileURLToPath(new URL('../../../artifacts/lifetech-local-login/',import.meta.url))
await mkdir(output,{recursive:true})
const profile=await mkdtemp(join(tmpdir(),'lifetech-login-'))
const fixture={email:`desktop-login-check-${randomUUID()}@example.com`,password:randomBytes(24).toString('base64url')}
const provision=`import sys,json,asyncio
sys.path.insert(0,'/app')
from urllib.parse import urlsplit
from config import settings
from db import SessionLocal,engine
from models import User,PortalSsoRequest
from sqlalchemy import select,delete
from security import hash_password
assert settings.env=='dev' and urlsplit(settings.public_base_url).hostname in {'localhost','id.localhost'}
assert urlsplit(settings.database_url).hostname=='lifetech-identity-db'
data=json.load(sys.stdin)
assert data['email'].startswith('desktop-login-check-') and data['email'].endswith('@example.com')
async def run():
 async with SessionLocal() as s:
  member=(await s.execute(select(User).where(User.email==data['email']))).scalar_one_or_none()
  if data['action']=='create':
   assert member is None
   member=User(email=data['email'],full_name='Disposable desktop login check',hashed_password=hash_password(data['password']),is_active=True,identity_data={'email_verified':True,'local_test_bot':True})
   s.add(member)
  elif member:
   assert member.identity_data.get('local_test_bot')
   await s.execute(delete(PortalSsoRequest).where(PortalSsoRequest.subject==f'owner:{member.id}'))
   await s.delete(member)
  await s.commit()
 await engine.dispose()
asyncio.run(run())`
function fixtureAction(action){
 const result=spawnSync('docker',['exec','-i','lifetech-identity-api','/venv/bin/python','-c',provision],{input:JSON.stringify({...fixture,action}),encoding:'utf8'})
 assert.equal(result.status,0,`Local fixture ${action} failed: ${result.stderr}`)
}
let application, externalBrowser, lastPage
const browserMode=process.env.ORGPORTAL_TEST_BROWSER_AUTH==='1'
try {
 fixtureAction('create')
 application=await _electron.launch({executablePath:electron,chromiumSandbox:true,args:['--ozone-platform=x11',fileURLToPath(new URL('./main.cjs',import.meta.url)),'--dev','https://localhost:8770/'],env:{...electronEnvironment(),WAYLAND_DISPLAY:'',XDG_CONFIG_HOME:profile}})
 const appPage=await application.firstWindow();appPage.setDefaultTimeout(20000)
 let page=appPage
 const destinations=[]
 page.on('framenavigated',frame=>{if(frame===page.mainFrame()){const u=new URL(frame.url());destinations.push(u.origin+u.pathname)}})
 await page.waitForFunction(()=>document.documentElement.dataset.desktop==='true')
 if(browserMode){
  // Exercise the portal's React Login link, which does not emit will-navigate.
  await page.goto('https://localhost:8770/org-events', {waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>document.documentElement.dataset.desktop==='true')
  await application.evaluate(({shell})=>{shell.openExternal=async url=>{globalThis.__browserAuthUrl=url}})
  await page.getByRole('link',{name:'Login',exact:true}).first().click({noWaitAfter:true})
  for(let i=0;i<100;i++){
   if(await application.evaluate(()=>!!globalThis.__browserAuthUrl))break
   await new Promise(resolve=>setTimeout(resolve,100))
  }
  const authorization=await application.evaluate(()=>globalThis.__browserAuthUrl)
  assert.equal(new URL(appPage.url()).pathname, '/org-events', 'The native window must stay on LifeTech while the normal browser signs in')
  await appPage.getByRole('region', {name:'Browser sign-in'}).or(appPage.getByRole('complementary', {name:'Browser sign-in'})).waitFor()
  await appPage.getByRole('button', {name:'Cancel sign-in', exact:true}).waitFor()
  console.log('Desktop requested external authorization; native window stayed on LifeTech with visible status and cancel')
  assert.ok(authorization,'Native app must open the PIdP authorization URL')
  externalBrowser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--disable-gpu']})
  const context=await externalBrowser.newContext()
  page=await context.newPage();lastPage=page;page.setDefaultTimeout(20000)
  await page.goto(authorization,{waitUntil:'domcontentloaded'})
  console.log('External browser reached local PIdP')
 }else await application.evaluate(({Menu})=>Menu.getApplicationMenu().items[0].submenu.items.find(item=>item.label==='Sign in Here').click())
 const email=page.getByRole('link',{name:'Continue with email',exact:true})
 await page.locator('#login-email').or(email).first().waitFor()
 if(await email.isVisible()) await email.click()
 await page.locator('#login-email').waitFor()
 assert.equal(new URL(page.url()).hostname,'id.localhost')
 await page.screenshot({path:output+(browserMode?'browser-login-form.png':'login-form.png')})
 await page.locator('#login-email').fill(fixture.email)
 await page.locator('#login-password').fill(fixture.password)
 await page.getByRole('button',{name:'Sign in',exact:true}).click()
 console.log('Submitted disposable local member sign-in')
 if(browserMode){
  await page.getByRole('heading',{name:'Signed in to OrgPortal',exact:true}).waitFor({timeout:30000})
  page=appPage
 }
 await page.waitForURL(u=>u.origin==='https://localhost:8770'&&!u.pathname.startsWith('/pidp/')&&u.pathname!=='/auth/callback',{timeout:30000})
 assert.equal(await page.evaluate(async()=> (await fetch('/pidp/auth/session-token')).status),200)
 await page.goto('https://localhost:8770/org-events',{waitUntil:'domcontentloaded'})
 await page.getByRole('button',{name:'Open user menu',exact:true}).waitFor()
 await page.reload({waitUntil:'domcontentloaded'})
 await page.getByRole('button',{name:'Open user menu',exact:true}).waitFor()
 assert.equal(await page.evaluate(async()=> (await fetch('/pidp/auth/session-token')).status),200)
 await page.waitForFunction(()=>document.documentElement.dataset.desktop==='true')
 await page.screenshot({path:output+(browserMode?'browser-signed-in.png':'signed-in.png')})
 if(browserMode){
  await application.evaluate(({Menu})=>{
   globalThis.__browserAuthUrl=null
   Menu.getApplicationMenu().items[0].submenu.items.find(item=>item.label==='Sign in Using Browser').click()
  })
  let authorization
  for(let i=0;i<100;i++){
   authorization=await application.evaluate(()=>globalThis.__browserAuthUrl)
   if(authorization)break
   await new Promise(resolve=>setTimeout(resolve,100))
  }
  assert.ok(authorization)
  await lastPage.goto(authorization,{waitUntil:'domcontentloaded'})
  await lastPage.getByRole('heading',{name:'Signed in to OrgPortal',exact:true}).waitFor({timeout:30000})
  await appPage.waitForURL(u=>u.origin==='https://localhost:8770'&&u.pathname==='/org-events')
  await appPage.getByRole('button',{name:'Open user menu',exact:true}).waitFor()
  console.log('PASS: existing browser session returns to the app without another password')
  await application.evaluate(({Menu})=>Menu.getApplicationMenu().items[0].submenu.items.find(item=>item.label==='Sign in Using Browser').click())
  await appPage.getByRole('button',{name:'Cancel sign-in',exact:true}).click()
  await appPage.locator('.desktop-sign-in-status').waitFor({state:'detached'})
  assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getTitle()),'OrgPortal Development')
  console.log('PASS: browser sign-in can be cancelled from the visible status banner')
 }
 await writeFile(output+(browserMode?'browser-auth-report.json':'login-report.json'),JSON.stringify({passed:true,mode:browserMode?'System browser with S256 PKCE':'In-app',origin:'https://localhost:8770',issuer:'https://id.localhost:8443',destinations,session:200,sessionAfterReload:200,fixture:'disposable unprivileged local member'},null,2))
 console.log(browserMode?'PASS: separate browser sign-in with PKCE → desktop app session → reload':'PASS: LifeTech Login → local PIdP email form → password → LifeTech callback → session survives reload')
} catch(error) {
 if(lastPage){const u=new URL(lastPage.url());console.log('External page:',u.origin+u.pathname,await lastPage.title());await lastPage.screenshot({path:output+'browser-auth-failure.png'})}
 throw error
} finally {
 if(externalBrowser) await externalBrowser.close()
 if(application) await application.close()
 fixtureAction('delete')
 await rm(profile,{recursive:true,force:true})
 console.log('Removed disposable local identity fixture and browser profile')
}
