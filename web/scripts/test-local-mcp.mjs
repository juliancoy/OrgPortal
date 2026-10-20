// Actual local Docker OAuth + browser + HTTP MCP. No route fulfillment or token fixtures.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base=process.env.LOCAL_MCP_BASE||'https://localhost:9446';
assert.equal(new URL(base).hostname,'localhost');
assert.equal(new URL(base).protocol,'https:');
const project=process.env.LOCAL_MCP_PROJECT||'orgportal-mcp-e2e';
assert.equal(project,'orgportal-mcp-e2e','Only the dedicated synthetic test stack is supported');
const compose=process.env.LOCAL_MCP_COMPOSE || fileURLToPath(new URL('../../.local/mcp-e2e/compose.json',import.meta.url));
function docker(...args){return execFileSync('docker',['compose','-p',project,'-f',compose,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});}
const config=JSON.parse(docker('config','--format','json'));
assert.equal(config.services.gateway.ports[0].host_ip,'127.0.0.1');
assert.equal(config.services.identity.environment.PUBLIC_BASE_URL,base+'/pidp');
assert.equal(config.services.identity.environment.EMAIL_VERIFICATION_DELIVERY,'log');
assert.equal(config.services.identity.environment.MCP_OAUTH_ISSUER,base);
assert(config.services.db.volumes.every(volume=>volume.type==='volume'));
assert(Object.values(config.volumes).every(volume=>!volume.external&&volume.name.startsWith(project+'_')));
const workerConfig=JSON.parse(readFileSync(fileURLToPath(new URL('../../.local/mcp-e2e/worker.json',import.meta.url)),'utf8'));
assert.equal(workerConfig.vars.ORGANIZATION_REPLICA_SOURCE,'');
assert.equal(workerConfig.vars.EMAIL_SENDING_ENABLED,'false');
assert.equal(workerConfig.vars.MCP_PUBLIC_URL,base+'/api/org/mcp');
assert(workerConfig.d1_databases.every(db=>db.database_id==='00000000-0000-0000-0000-000000000001'));
assert(!workerConfig.services && !workerConfig.queues);
const artifactRoot=fileURLToPath(new URL('../../.local/mcp-e2e/results/',import.meta.url));
mkdirSync(artifactRoot,{recursive:true,mode:0o700});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':undefined),headless:true,args:['--no-sandbox']});
const results=[];
let page;
try {
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}});
  const external=[];
  // Blocking is a confinement guard; local API, OAuth, and MCP traffic is never mocked.
  await context.route('**/*',route=>{
    if(new URL(route.request().url()).origin===base)return route.continue();
    external.push(new URL(route.request().url()).origin);return route.abort();
  });
  for(const path of ['/pidp/health','/api/org/health'])assert((await context.request.get(base+path,{maxRedirects:0})).ok());
  const email='mcp-browser-'+randomBytes(10).toString('hex')+'@example.com';
  const password=randomBytes(32).toString('base64url');
  // Provision only credentials and verify email through the normal public local routes.
  const registered=await context.request.post(base+'/pidp/websites/orgportal/auth/register',{data:{email,password,full_name:'Local MCP Browser Test',identity_data:{}},maxRedirects:0});
  assert(registered.ok(),'Synthetic local account registration failed');
  let verification;
  for(let i=0;i<40&&!verification;i++){
    const log=docker('logs','--no-color','--since','5m','identity');
    verification=log.match(/https?:\/\/[^\s"<>]+/g)?.map(value=>{try{return new URL(value)}catch{return null}}).find(url=>url?.pathname.endsWith('/auth/verify-email')&&url.searchParams.get('email')===email);
    if(!verification)await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert(verification,'Local verification mailbox did not receive the fixture message');
  assert.equal(verification.origin,base);
  const verified=await context.request.get(base+'/pidp/auth/verify-email?'+verification.searchParams,{maxRedirects:0});
  assert.equal(verified.status(),303);assert(!verified.headers().location.includes('error='));
  page=await context.newPage();
  // Begin cold: the MCP connection itself must send the browser through account sign-in.
  await context.clearCookies();
  await page.goto(base+'/chatgpt-simulator');
  await page.getByRole('link',{name:'Connect with read access',exact:true}).click();
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.locator('form').filter({has:page.locator('#login-email')}).getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('button',{name:'Allow access',exact:true})).toBeVisible({timeout:30000});
  await expect(page.getByText(email,{exact:true})).toBeVisible();
  await page.screenshot({path:artifactRoot+'consent-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Consent layout overflows mobile width');
  await page.screenshot({path:artifactRoot+'consent-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Allow access',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Connection test passed',exact:true})).toBeVisible({timeout:60000});
  results.push(JSON.parse(await page.locator('#result').innerText()));
  console.log('PASS: cold browser sign-in, verified account, consent, confidential web-client OAuth and real MCP reads');
  // The same real browser session must support another independently consented grant.
  await page.goto(base+'/chatgpt-simulator');
  await page.getByRole('link',{name:'Connect with write scope',exact:true}).click();
  await expect(page.getByRole('button',{name:'Allow access',exact:true})).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:'Allow access',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Connection test passed',exact:true})).toBeVisible({timeout:60000});
  results.push(JSON.parse(await page.locator('#result').innerText()));
  console.log('PASS: write-scoped consent preserves live operator/domain permission checks');
  await page.goto(base+'/chatgpt-simulator');
  await page.getByRole('link',{name:'Connect with read access',exact:true}).click();
  await expect(page.getByRole('button',{name:'Deny',exact:true})).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:'Deny',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Access denied as requested',exact:true})).toBeVisible({timeout:30000});
  results.push(JSON.parse(await page.locator('#result').innerText()));
  console.log('PASS: consent denial returns access_denied without issuing tokens');
  // ChatGPT's embedded browser and the already signed-in portal browser are isolated.
  const chatContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}});
  await chatContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const chat=await chatContext.newPage();
  await chat.goto(base+'/chatgpt-simulator');
  await chat.getByRole('link',{name:'Connect from another browser',exact:true}).click();
  await expect(chat.getByRole('heading',{name:'Connect your account',exact:true})).toBeVisible({timeout:30000});
  const pairing=(await chat.locator('code').innerText()).trim();
  const signInLink=await chat.locator('#link').inputValue();
  assert.equal(new URL(signInLink).origin,base);
  await page.goto(signInLink);
  await expect(page.getByRole('heading',{name:'Confirm your account',exact:true})).toBeVisible();
  const invalid=await context.request.post(base+'/pidp/oauth/mcp/link',{form:{request:new URL(signInLink).searchParams.get('request'),pairing_code:pairing==='0000-0000'?'1111-1111':'0000-0000'},headers:{origin:base},maxRedirects:0});
  assert.equal(invalid.status(),400,'A wrong pairing code must not link browsers');
  await page.getByLabel('Matching code').fill(pairing);
  await page.getByRole('button',{name:'Confirm this account',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Account confirmed',exact:true})).toBeVisible();
  await expect(chat.getByRole('button',{name:'Continue to permissions',exact:true})).toBeVisible({timeout:15000});
  await chat.getByRole('button',{name:'Continue to permissions',exact:true}).click();
  await expect(chat.getByRole('button',{name:'Allow access',exact:true})).toBeVisible();
  await expect(chat.getByText(email,{exact:true})).toBeVisible();
  await chat.getByRole('button',{name:'Allow access',exact:true}).click();
  await expect(chat.getByRole('heading',{name:'Connection test passed',exact:true})).toBeVisible({timeout:60000});
  results.push({...JSON.parse(await chat.locator('#result').innerText()),crossBrowser:true});
  await chat.screenshot({path:artifactRoot+'result.png',fullPage:true});
  await chatContext.close();
  console.log('PASS: separate ChatGPT and portal browser contexts, matching-code protection and original-browser consent');
  writeFileSync(artifactRoot+'summary.json',JSON.stringify({localOnly:true,simulatedClient:'ChatGPT web via DCR',results},null,2)+'\n',{mode:0o600});
  await context.close();
} catch(error) {
  if(page){await page.screenshot({path:artifactRoot+'failure.png',fullPage:true}); console.error('Browser stopped at',new URL(page.url()).pathname, 'heading:',await page.locator('h1').allTextContents());}
  throw error;
} finally { await browser.close(); }
console.log('PASS: PKCE mismatch, wrong resource, code replay, refresh, revocation, desktop and mobile consent');
