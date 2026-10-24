// Actual local Docker OAuth + browser + HTTP MCP. No route fulfillment or token fixtures.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
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
let activeEmail;
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
  activeEmail=email;
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
  // Recovery scenarios use real local OAuth/MCP. Network aborts inject transport
  // faults only; no OAuth responses, accounts or tokens are fabricated.
  const grantCount=()=>Number(docker('exec','-T','db','psql','-U','fixture','-d','fixture','-At','-c','SELECT COUNT(*) FROM mcp_oauth_grants').trim());
  const startRecovery=async()=>{
    const before=grantCount();
    await page.goto(base+'/chatgpt-simulator/start?mode=read&expectedAccount='+encodeURIComponent(activeEmail));
    return before;
  };
  const finishRecovery=async(scenario,before)=>{
    await expect(page.getByRole('button',{name:'Allow access',exact:true})).toBeVisible({timeout:30000});
    await expect(page.getByText(activeEmail,{exact:true})).toBeVisible();
    assert.equal(grantCount(),before,'No grant may be created before explicit consent');
    await page.getByRole('button',{name:'Allow access',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Connection test passed',exact:true})).toBeVisible({timeout:60000});
    assert.equal(grantCount(),before+1,'A fresh connection must create exactly one grant');
    results.push({...JSON.parse(await page.locator('#result').innerText()),scenario});
  };
  const setup=await browser.newContext({ignoreHTTPSErrors:true});
  const alternateEmail='mcp-recovery-'+randomBytes(10).toString('hex')+'@example.com',alternatePassword=randomBytes(32).toString('base64url');
  assert((await setup.request.post(base+'/pidp/websites/orgportal/auth/register',{data:{email:alternateEmail,password:alternatePassword,full_name:'Local Recovery Account',identity_data:{}},maxRedirects:0})).ok());
  let alternateVerification;
  for(let i=0;i<40&&!alternateVerification;i++){
    const log=docker('logs','--no-color','--since','5m','identity');
    alternateVerification=log.match(/https?:\/\/[^\s"<>]+/g)?.map(value=>{try{return new URL(value)}catch{return null}}).find(url=>url?.pathname.endsWith('/auth/verify-email')&&url.searchParams.get('email')===alternateEmail);
    if(!alternateVerification)await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert(alternateVerification&&alternateVerification.origin===base,'Recovery verification must remain local');
  assert.equal((await setup.request.get(base+'/pidp/auth/verify-email?'+alternateVerification.searchParams,{maxRedirects:0})).status(),303);
  await setup.close();
  // A remembered account must be replaceable before any grant is issued.
  const beforeSwitch=grantCount();
  await page.goto(base+'/chatgpt-simulator/start?mode=read&expectedAccount='+encodeURIComponent(alternateEmail));
  await expect(page.getByText(email,{exact:true})).toBeVisible();
  assert.equal(grantCount(),beforeSwitch);
  await page.getByRole('link',{name:'Use a different account',exact:true}).click();
  await expect(page.locator('#login-email')).toBeVisible({timeout:30000});
  await page.locator('#login-email').fill(alternateEmail);await page.locator('#login-password').fill(alternatePassword);
  await page.locator('form').filter({has:page.locator('#login-email')}).getByRole('button',{name:'Sign in',exact:true}).click();
  activeEmail=alternateEmail;
  await expect(page.getByText(email,{exact:true})).toHaveCount(0);
  await finishRecovery('wrong-account-switch',beforeSwitch);
  console.log('PASS: wrong remembered account switched before consent; MCP canonical account matches the selected account');
  // Expire only this synthetic consent, without waiting ten minutes or touching
  // another request. Never output the nonce, its hash or database row.
  const beforeExpired=await startRecovery();
  await expect(page.getByRole('button',{name:'Allow access',exact:true})).toBeVisible({timeout:30000});
  const nonce=await page.locator('input[name="request"]').inputValue();
  assert(/^consent_[A-Za-z0-9_-]{43,100}$/.test(nonce));
  const id=createHash('sha256').update(nonce).digest('hex');assert(/^[a-f0-9]{64}$/.test(id));
  const expired=docker('exec','-T','db','psql','-U','fixture','-d','fixture','-c',`UPDATE mcp_oauth_requests SET expires_at=0 WHERE id='${id}'`);
  assert(expired.includes('UPDATE 1'),'Exactly the fixture consent must expire');
  const rejection=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/oauth/mcp/authorize')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Allow access',exact:true}).click();assert.equal((await rejection).status(),400);
  await expect(page.getByRole('heading',{name:'Permissions review expired or invalid',exact:true})).toBeVisible();
  assert.equal(grantCount(),beforeExpired,'Expired consent must not create a grant');
  await finishRecovery('expired-consent-fresh-connection',await startRecovery());
  console.log('PASS: expired consent creates no grant, shows recovery guidance and reconnects with fresh consent');
  // Fail a metadata read once. Retrying the read must reach the real backend.
  await context.clearCookies({name:'__Host-pidp_mcp_session'});
  const handoffPattern=base+'/pidp/oauth/mcp/handoff*';let interruptedReads=0;
  const dropRead=async route=>{if(route.request().method()==='GET'&&interruptedReads++===0)return route.abort('internetdisconnected');return route.continue()};
  await context.route(handoffPattern,dropRead);
  const beforeReadLoss=await startRecovery();
  await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible({timeout:30000});
  assert.equal(grantCount(),beforeReadLoss);
  await page.getByRole('button',{name:'Try again',exact:true}).click();
  await finishRecovery('interrupted-read-retry',beforeReadLoss);
  await context.unroute(handoffPattern,dropRead);
  console.log('PASS: lost connection before handoff confirmation recovers through one explicit retry');
  // Consume a real handoff then discard its response. Do not replay that POST.
  await context.clearCookies({name:'__Host-pidp_mcp_session'});let droppedPosts=0;
  const dropConfirmation=async route=>{
    if(route.request().method()!=='POST')return route.continue();
    droppedPosts++;assert((await route.fetch({maxRedirects:0})).ok(),'The local handoff must complete before losing its response');return route.abort('connectionreset');
  };
  await context.route(handoffPattern,dropConfirmation);
  const beforePostLoss=await startRecovery();
  await expect(page.getByRole('alert')).toContainText('Start a new connection',{timeout:30000});
  await expect(page.getByRole('button',{name:'Try again',exact:true})).toHaveCount(0);
  assert.equal(droppedPosts,1);assert.equal(grantCount(),beforePostLoss);
  await context.unroute(handoffPattern,dropConfirmation);
  await finishRecovery('lost-confirmation-fresh-connection',await startRecovery());
  // exercise() revokes every completed grant and proves its tokens are rejected.
  // Reconnecting must therefore obtain a separate, freshly consented grant.
  await finishRecovery('reconnect-after-revocation',await startRecovery());
  console.log('PASS: a lost one-use response is not replayed; fresh connections recover after transport loss and revocation');
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
  await expect(chat.getByText(activeEmail,{exact:true})).toBeVisible();
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
