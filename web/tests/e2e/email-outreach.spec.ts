import { expect, test } from '@playwright/test'
test.use({ignoreHTTPSErrors:true,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}})
for(const historical of [true,false]) test(`outreach analytics ${historical?'historical':'tracked'}`,async({page,baseURL},info)=>{
 if(!baseURL||!['localhost','127.0.0.1'].includes(new URL(baseURL).hostname))throw new Error('Local fixtures only')
 const campaign={id:'campaign',organization_id:'group',subject:'LifeTech invitation',status:historical?'completed':'paused',audience_mode:'outreach',report_only:historical?1:0,recipient_count:292,sent_count:248,created_at:Date.now(),eligible_count:50,fingerprint:'fingerprint',preview_id:'receipt',self_test_sent:true,scheduled_at:Date.now(),from_email:'events@example.test',preview:{subject:'LifeTech invitation',html:'<h1>LifeTech invitation</h1>',text:'LifeTech invitation'},counts:{sent:248,skipped:44},deliveries:[],engagement:{sent:248,tracked:historical?0:240,opened:120,clicked:60,unsubscribed:2},delivery_stats:{total:292,accepted:248,bounced:8,failed:0,uncertain:0,skipped:44,pending:0}}
 let resumed=false
 await page.route('**/api/org/**',r=>r.fulfill({json:{}}))
 await page.route('**/auth/session-token',r=>r.fulfill({json:{access_token:'fixture.payload.signature'}}))
 await page.route('**/auth/me',r=>r.fulfill({json:{id:'fixture',email:'sender@example.test',full_name:'Organizer',is_admin:true}}))
 await page.route('**/api/org/api/email/**',r=>{
 const path=new URL(r.request().url()).pathname
 if(path.endsWith('/groups'))return r.fulfill({json:[{id:'group',name:'LifeTech'}]})
 if(path.endsWith('/sender'))return r.fulfill({json:{configured:true,setup_issues:[],connected:true,sending_enabled:true,email:'sender@example.test',from_email:'events@example.test',status:'connected',daily_limit:500,used_last_24h:4,can_read_bounces:true}})
 if(path.endsWith('/audience'))return r.fulfill({json:{contacts:[],event_count:0,organization_count:0}})
 if(path.endsWith('/campaigns'))return r.fulfill({json:[campaign]})
 if(path.endsWith('/campaign/resume')){expect(r.request().postDataJSON()).toEqual({fingerprint:'fingerprint',preview_id:'receipt',confirm:true});resumed=true;return r.fulfill({json:{}})}
 if(path.endsWith('/campaign'))return r.fulfill({json:campaign})
 return r.fulfill({json:[]})
 })
 await page.goto('/email?organization_id=group&campaign_id=campaign')
 await expect(page.getByRole('heading',{name:'Campaign analytics'})).toBeVisible()
 await expect(page.frameLocator('iframe[title="Email preview"]').getByRole('heading',{name:'LifeTech invitation'})).toBeVisible()
 await expect(page.getByRole('img',{name:/Delivery outcomes for 292/})).toBeVisible()
 await expect(page.locator('.email-pie')).toHaveCount(historical?1:4)
 if(historical)await expect(page.getByText(/cannot be recovered/)).toBeVisible()
 else{await page.getByRole('button',{name:'Approve next batch of 50'}).click();await expect.poll(()=>resumed).toBe(true)}
 await page.getByText('Prepare a one-time outreach campaign',{exact:true}).click()
 await page.locator('input[type=file]').first().setInputFiles({name:'contacts.csv',mimeType:'text/csv',buffer:Buffer.from('email,name,source_url,source_checked_at\ncontact@example.test,Contact,https://example.test/contact,2026-10-18\n')})
 await expect(page.getByText('1 imported rows · review evidence')).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
 await page.screenshot({path:`/tmp/orgportal-outreach-${historical?'history':'tracked'}-${info.project.name}.png`,fullPage:true})
})
