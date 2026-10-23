// Physical Android Chrome + isolated local OrgPortal Docker. No production login.
import {chromium,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const base='https://localhost:9458',endpoint='http://127.0.0.1:9223';
const credentials=JSON.parse(readFileSync(new URL('../../.local/session-test/account.json',import.meta.url),'utf8'));
if(credentials.email!=='session-persistence@example.com')throw new Error('Dummy account required');
const originalStayOn=execFileSync('adb',['shell','settings','get','global','stay_on_while_plugged_in'],{encoding:'utf8'}).trim();
execFileSync('adb',['shell','svc','power','stayon','usb']);execFileSync('adb',['shell','input','keyevent','KEYCODE_WAKEUP']);execFileSync('adb',['shell','wm','dismiss-keyguard']);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
let browser=await chromium.connectOverCDP(endpoint),context=browser.contexts()[0],page;
const originalCookies=await context.cookies(base);
async function open(){page=await context.newPage();const cdp=await context.newCDPSession(page);await cdp.send('Security.setIgnoreCertificateErrors',{ignore:true});await page.goto(base+'/people');await page.bringToFront();return cdp}
async function record(name,work){await work();results.push({name,status:'PASS'});console.log('PASS',name)}
async function request(path,options={}){return page.evaluate(async({path,options})=>{const r=await fetch(path,options);return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():null}}, {path,options})}
const reportDir=new URL('../../../artifacts/session-persistence-2026-10-23/',import.meta.url).pathname;
let cdp;
try{
 cdp=await open();
 await record('Dummy login creates a persistent host-only HttpOnly cookie',async()=>{
  const login=await request('/pidp/auth/session/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:credentials.email,password:credentials.password}).toString()});if(login.status>=300)throw new Error('Dummy login rejected');
  await page.reload();await expect(page.getByRole('button',{name:'Open user menu'})).toBeVisible({timeout:10000});
  const cookie=(await context.cookies(base)).find(c=>c.name==='pidp_token');if(!cookie?.httpOnly||!cookie.secure||cookie.sameSite!=='Lax'||cookie.expires<Date.now()/1000+29*86400)throw new Error('Persistence or cookie attributes incorrect');
  if(await page.evaluate(()=>localStorage.getItem('orgportal.auth.accessToken'))!==null)throw new Error('Browser bearer token persisted in localStorage');
 });
 await record('Reload restores the signed-in app through its cookie',async()=>{await page.reload();await expect(page.getByRole('button',{name:'Open user menu'})).toBeVisible()});
 await record('Temporary session-network failure preserves the signed-in UI',async()=>{
  await page.route('**/pidp/auth/session-token',r=>r.abort('internetdisconnected'));await sleep(5500);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await sleep(700);await expect(page.getByRole('button',{name:'Open user menu'})).toBeVisible();await page.unroute('**/pidp/auth/session-token');await sleep(5500);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(page.getByRole('button',{name:'Open user menu'})).toBeVisible();
 });
 await record('Force-stopping and restarting Android Chrome preserves login',async()=>{
  await cdp.send('Security.setIgnoreCertificateErrors',{ignore:false});execFileSync('adb',['shell','input','keyevent','KEYCODE_HOME']);await sleep(31000);
  execFileSync('adb',['shell','am','force-stop','com.android.chrome']);execFileSync('adb',['shell','am','start','-n','com.android.chrome/com.google.android.apps.chrome.Main'],{stdio:'ignore'});
  let connected=false;for(let i=0;i<30;i++){try{browser=await chromium.connectOverCDP(endpoint,{timeout:1000});connected=true;break}catch{await sleep(300)}}if(!connected)throw new Error('Chrome did not reconnect');context=browser.contexts()[0];cdp=await open();await expect(page.getByRole('button',{name:'Open user menu'})).toBeVisible({timeout:30000});if((await request('/pidp/auth/session-token')).status!==200)throw new Error('Cookie lost on restart');
 });
 await record('Offline sign-out stays signed out across reload and revokes on reconnect',async()=>{
  await page.route('**/pidp/auth/session/logout',r=>r.abort('internetdisconnected'));
  await page.getByRole('button',{name:'Open user menu'}).evaluate(button=>button.click());
  await page.getByRole('menuitem',{name:'Sign out',exact:true}).evaluate(button=>button.click());
  await expect(page.getByRole('button',{name:'Open user menu'})).toHaveCount(0);
  await page.reload();await expect(page.getByRole('button',{name:'Open user menu'})).toHaveCount(0);
  await page.unroute('**/pidp/auth/session/logout');await sleep(5500);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect.poll(async()=>(await request('/pidp/auth/session-token')).status).toBe(401);
  const login=await request('/pidp/auth/session/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:credentials.email,password:credentials.password}).toString()});
  if(login.status>=300)throw new Error('Relogin rejected');await page.reload();await expect(page.getByRole('button',{name:'Open user menu'})).toBeVisible();
 });
 await record('Logout revokes session and captured access token',async()=>{
  const access=(await request('/pidp/auth/session-token')).body.access_token;
  if((await request('/pidp/auth/session/logout',{method:'POST'})).status>=300)throw new Error('Logout failed');
  if((await request('/pidp/auth/session-token')).status!==401)throw new Error('Cookie session survived logout');
  if((await request('/pidp/auth/me',{headers:{Authorization:'Bearer '+access}})).status!==401)throw new Error('Captured access token survived logout');
  await page.reload();await expect(page.getByRole('button',{name:'Open user menu'})).toHaveCount(0);
 });
}catch(error){console.log('LOCAL SESSION STATE',{cookies:(await context.cookies(base)).map(c=>({name:c.name,expires:c.expires,httpOnly:c.httpOnly})),logoutPending:await page.evaluate(()=>localStorage.getItem('orgportal.auth.logoutPending')),sessionStatus:(await request('/pidp/auth/session-token')).status});console.log('LOCAL UI',await page.locator('body').innerText());await page.screenshot({path:'/tmp/pidp-persistence-phone-failure.png',fullPage:true,timeout:3000}).catch(()=>{});throw error}finally{
 mkdirSync(reportDir,{recursive:true});writeFileSync(reportDir+'android-results.json',JSON.stringify({device:'Physical Pixel 3, Chrome',scope:'Full isolated OrgPortal SPA and Python identity Docker',results},null,2));
 execFileSync('adb',['shell','settings','put','global','stay_on_while_plugged_in',originalStayOn]);
 if(cdp)await cdp.send('Security.setIgnoreCertificateErrors',{ignore:false}).catch(()=>{});
 await context.clearCookies({domain:'localhost'});if(originalCookies.length)await context.addCookies(originalCookies);
 for(const p of context.pages())if(p.url().startsWith(base+'/'))await p.close().catch(()=>{});
}
process.exit(0);
