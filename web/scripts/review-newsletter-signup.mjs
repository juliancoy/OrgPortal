import {chromium} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
import assert from 'node:assert/strict'
const base=process.env.PLAYWRIGHT_BASE_URL || 'https://localhost:8443'
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Use the isolated local Docker gateway')
const out=new URL('../../../artifacts/org-newsletter/',import.meta.url).pathname
await mkdir(out,{recursive:true})
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome'})
try{for(const width of [390,1440]){
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:1000}})
 const page=await context.newPage();page.on('pageerror',error=>console.log('Browser error:',error.message));const submissions=[];let fail=true
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),path=url.pathname
  if(!['localhost','127.0.0.1'].includes(url.hostname))return route.abort()
  if((path.startsWith('/pidp/auth/') || path.startsWith('/auth/')))return route.fulfill({status:401,json:{}})
  if(!path.startsWith('/api/org/'))return route.continue()
  let data=[]
  if(path.endsWith('/api/portal/site'))data={id:'fixture',organization_id:'fixture-alpha',hostname:'localhost',name:'Dummy Alpha',tagline:'Local fixture',features:[],profile:'community'}
  else if(path.includes('/orgs/public/')){const slug=path.split('/').at(-1);data={id:slug==='fixture-alpha'?'fixture-alpha':`fixture-${slug}`,slug:slug==='fixture-alpha'?'alpha':slug,name:slug==='beta'?'Dummy Beta':'Dummy Alpha',links:[{id:'github',type:'github',url:'https://github.com/example'}]}}
  else if(path.includes('/email/newsletter/')){
   submissions.push({path,body:route.request().postDataJSON()})
   if(fail){fail=false;return route.fulfill({status:503,json:{detail:'Please retry the signup.'}})}
   return route.fulfill({json:{ok:true,message:'Thank you! You are subscribed.'}})
  }
  return route.fulfill({json:data})
 })
 await page.goto(base+'/orgs/alpha/subscribe',{waitUntil:'domcontentloaded'})
 await page.getByRole('heading',{name:'Join Dummy Alpha’s mailing list'}).waitFor({timeout:30000}).catch(async error=>{await page.screenshot({path:out+'failure.png'});throw error})
 const email=page.getByRole('textbox',{name:'Email address'}),consent=page.getByRole('checkbox',{name:/I agree to receive/}),submit=page.getByRole('button',{name:'Subscribe',exact:true})
 assert.equal(await submit.isDisabled(),true)
 await email.fill('synthetic@example.test');await consent.check();await submit.click()
 await page.getByRole('alert').filter({hasText:'Please retry the signup.'}).waitFor()
 assert.equal(await email.inputValue(),'synthetic@example.test')
 await submit.click();await page.getByText('Thank you! You are subscribed.',{exact:true}).waitFor()
 assert.equal(submissions.length,2);assert.equal(submissions[1].path,'/api/org/api/email/newsletter/fixture-alpha');assert.deepEqual(submissions[1].body,{email:'synthetic@example.test',consent:true})
 assert.equal(await email.inputValue(),'');assert.equal(await consent.isChecked(),false)
 await page.getByRole('link',{name:'Join Dummy Alpha’s mailing list',exact:true}).waitFor()
 await page.screenshot({path:out+`signup-${width}.png`})
 await page.goto(base+'/orgs/beta/subscribe',{waitUntil:'domcontentloaded'})
 await page.getByRole('heading',{name:'Join Dummy Beta’s mailing list'}).waitFor()
 assert.equal(await email.inputValue(),'');assert.equal(await consent.isChecked(),false)
 console.log(width,'anonymous consent, error/retry, success, tenant mail icon and organization isolation verified')
 await context.close()
}}finally{await browser.close()}
