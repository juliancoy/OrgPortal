// Local Docker identities only. Do not point this test at a remote deployment.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {chromium} from '@playwright/test'
const root=fileURLToPath(new URL('../../',import.meta.url))
const fixture=spawnSync('python3',['-c',`
import importlib.util,json
from pathlib import Path
root=Path.cwd()
spec=importlib.util.spec_from_file_location('local_login',root/'scripts/local-login.py')
local=importlib.util.module_from_spec(spec);spec.loader.exec_module(local)
local.preflight('lifetech-identity-api','https://localhost:8443')
print(json.dumps(local.session('lifetech-identity-api')))
`],{cwd:root,encoding:'utf8'})
assert.equal(fixture.status,0,'Local Docker identity fixture must be available')
const account=JSON.parse(fixture.stdout),base='https://localhost:8443'
const target=base+'/auth/callback?'+new URLSearchParams({next:'/ecosystem/network'})
const start=base+'/pidp/auth/sso/start?'+new URLSearchParams({app:'orgportal',next:target})
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']})
try{
 const context=await browser.newContext({ignoreHTTPSErrors:true})
 await context.addCookies([{name:'pidp_token',value:account.token,url:base,httpOnly:true,secure:true,sameSite:'Lax'}])
 const registration=await context.request.get(base+'/pidp/auth/sso/client')
 assert.equal(registration.status(),200)
 const client=await registration.json();assert.equal(client.origin,base);assert.equal(client.accountApp,'orgportal')
 assert.equal((await context.request.get(base+'/pidp/auth/sso/start?app=wrong')).status(),400)
 assert.equal((await context.request.get(base+'/pidp/auth/sso/start?app=orgportal&next=https://unregistered.example/auth/callback')).status(),400)
 let current=start;const paths=[]
 for(let i=0;i<5;i++){
  assert(current.startsWith(base+'/'))
  const result=await context.request.get(current,{maxRedirects:0})
  assert.equal(result.status(),303,`${new URL(current).pathname}: handoff status`)
  paths.push(new URL(current).pathname);current=new URL(result.headers().location,current).href
  if(current===target)break
 }
 assert.equal(current,target);assert(paths.includes('/pidp/auth/sso/complete'))
 assert(!(await context.cookies()).some(c=>c.name==='__Host-pidp_sso_browser'&&c.value))
 const session=await context.request.get(base+'/pidp/auth/session-token')
 assert.equal(session.status(),200)
 const {access_token:accessToken}=await session.json()
 assert(accessToken)
 const profile=await context.request.get(base+'/pidp/auth/me',{headers:{Authorization:'Bearer '+accessToken}})
 assert.equal(profile.status(),200);assert.equal((await profile.json()).id,account.member_id)
 const guest=await browser.newContext({ignoreHTTPSErrors:true})
 const response=await guest.request.get(start)
 assert.equal(response.status(),200);assert.equal(new URL(response.url()).pathname,'/pidp/app/login')
 console.log('PASS: local registration, foreign-return/app rejection, browser-bound SSO completion, preserved member identity and guest sign-in entry')
}finally{await browser.close()}
