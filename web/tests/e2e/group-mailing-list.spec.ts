import { expect, test, type Page } from '@playwright/test'

test.use({ignoreHTTPSErrors:true})
test.beforeEach(async ({baseURL,page})=>{
  await page.route('**/*',route=>{if(!['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname))return route.abort();return route.continue()})
  if(!baseURL || !['localhost','127.0.0.1'].includes(new URL(baseURL).hostname))throw new Error('Mailing-list fixtures must run on the local Docker portal.')
})

async function fixtures(page:Page,role:'guest'|'member'|'organizer') {
  let preference=false,subscriberReads=0
  const organization={id:'workshop',slug:'workshop',name:'Workshop group',membership_count:1,claimed_by_user_id:'organizer',my_role:role==='organizer'?'administrator':'member'}
  await page.route('**/auth/session-token',route=>route.fulfill({status:role==='guest'?401:200,json:role==='guest'?{}:{access_token:'local.fixture.token'}}))
  await page.route('**/auth/me',route=>route.fulfill({status:role==='guest'?401:200,json:{id:'fixture-person',email:'fixture@example.test',full_name:'Fixture Person'}}))
  await page.route('**/api/org/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname
    let body:unknown=[]
    if(path.endsWith('/api/portal/site'))body={}
    else if(path.endsWith('/admin/me'))body={is_sysadmin:false}
    else if(path.endsWith('/orgs/public/workshop'))body=organization
    else if(path.endsWith('/membership'))body={organization_id:'workshop',status:'active',role:organization.my_role,membership_count:1}
    else if(path.endsWith('/api/network/orgs') && url.searchParams.get('mine')==='true')body=role==='organizer'?[organization]:[]
    else if(path.endsWith('/workshop/support'))body={descendants:[],supporters:[],records:[]}
    else if(path.endsWith('/subscription')) {
      if(route.request().method()==='PUT')preference=JSON.parse(route.request().postData()||'{}').subscribed
      body={status:preference?'subscribed':'unsubscribed'}
    } else if(path.endsWith('/subscribers')) {
      subscriberReads++
      body={items:[{id:'subscriber',name:'Fixture Subscriber',email:'subscriber@example.test',status:'subscribed',consent_source:'group-email-preferences',consented_at:1800000000000}],has_more:false,exports_enabled:false}
    } else if(path.endsWith('/api/email/groups'))body=role==='organizer'?[organization]:[]
    await route.fulfill({json:body})
  })
  return {reads:()=>subscriberReads,preference:()=>preference}
}

test('organizers see consent details and group campaign tools; export stays disabled',async({page})=>{
  const state=await fixtures(page,'organizer')
  await page.goto('/orgs/workshop?view=organizers')
  const mailing=page.getByRole('region',{name:'Group mailing list'})
  await expect(mailing).toBeVisible();await expect(mailing.getByText('subscriber@example.test')).toBeVisible()
  await expect(mailing.getByRole('link',{name:'Compose campaign and review delivery history'})).toHaveAttribute('href','/email?organization_id=workshop')
  await expect(mailing.getByRole('button',{name:'Export CSV'})).toHaveCount(0)
  expect(state.reads()).toBeGreaterThan(0)
})

test('members can change their own preference without requesting the mailing list',async({page})=>{
  const state=await fixtures(page,'member')
  await page.goto('/orgs/workshop?view=members')
  await expect(page.getByRole('heading',{name:'Workshop group',exact:true})).toBeVisible()
  await expect(page.getByRole('region',{name:'Group mailing list'})).toHaveCount(0)
  const preference=page.getByRole('checkbox',{name:'Receive announcements from this group'})
  await expect(preference).toBeEnabled();await preference.click();await expect(preference).toBeChecked()
  expect(state.preference()).toBe(true);expect(state.reads()).toBe(0)
})

test('guests never fetch subscriber records',async({page})=>{
  const state=await fixtures(page,'guest')
  await page.goto('/orgs/workshop?view=organizers')
  await expect(page.getByRole('heading',{name:'Workshop group',exact:true})).toBeVisible()
  await expect(page.getByRole('region',{name:'Group mailing list'})).toHaveCount(0)
  await expect(page.getByRole('checkbox',{name:'Receive announcements from this group'})).toHaveCount(0)
  expect(state.reads()).toBe(0)
})

test('a member opening the campaign URL sees an organizer access message',async({page})=>{
  await fixtures(page,'member')
  await page.goto('/email?organization_id=workshop')
  await expect(page.getByRole('heading',{name:'Organizer access required'})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Compose a group email'})).toHaveCount(0)
})

test('organizers preview a group announcement before confirming the exact recipient snapshot',async({page})=>{
  await fixtures(page,'organizer')
  let approved=false
  const campaign={id:'draft',subject:'Workshop news',status:'draft',recipient_count:1,sent_count:0,created_at:Date.now(),scheduled_at:Date.now(),sender_email:'organizer@example.test',audience:'organization',body:'A group update.',event_id:'',fingerprint:'snapshot',preview:{subject:'Workshop news',html:'<p>A group update.</p>',text:'A group update.'},counts:{draft:1},deliveries:[]}
  await page.route('**/api/org/api/email/**',async route=>{
    const path=new URL(route.request().url()).pathname
    let body:unknown=[]
    if(path.endsWith('/groups'))body=[{id:'workshop',name:'Workshop group'}]
    else if(path.endsWith('/sender'))body={connected:true,configured:true,sending_enabled:true,email:'organizer@example.test',status:'connected',used_today:0,daily_limit:250,cooldown_until:0}
    else if(path.endsWith('/audience'))body={event_count:0,organization_count:1,contacts:[{id:'subscriber',name:'Subscriber',email:'subscriber@example.test'}]}
    else if(path.endsWith('/campaigns') && route.request().method()==='POST') {
      const payload=JSON.parse(route.request().postData() || '{}')
      expect(payload.organization_id).toBe('workshop');expect(payload.event_id).toBe(null);expect(payload.audience).toBe('organization')
      body=campaign
    } else if(path.endsWith('/campaigns/draft'))body={...campaign,status:approved?'queued':'draft',preview_id:'one-use-preview'}
    else if(path.endsWith('/campaigns/draft/send')) {
      expect(JSON.parse(route.request().postData() || '{}')).toEqual({fingerprint:'snapshot',preview_id:'one-use-preview',confirm:true})
      approved=true;body={queued:true}
    }
    await route.fulfill({json:body})
  })
  await page.goto('/email?organization_id=workshop')
  await expect(page.getByRole('heading',{name:'Compose a group email'})).toBeVisible()
  await page.getByLabel('Subject',{exact:true}).fill('Workshop news')
  await page.getByLabel('Message',{exact:true}).fill('A group update.')
  await expect(page.getByRole('button',{name:'Send to 1 recipients',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'Save draft & preview',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Review your campaign'})).toBeVisible()
  await page.getByRole('button',{name:'Send to 1 recipients',exact:true}).click()
  await expect(page.getByRole('status').filter({hasText:'Campaign queued.'})).toBeVisible()
  expect(approved).toBe(true)
})
