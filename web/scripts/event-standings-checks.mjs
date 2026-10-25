import {chromium,expect} from '@playwright/test'
import {existsSync} from 'node:fs'
import {mkdir,readFile} from 'node:fs/promises'
import {join} from 'node:path'
export async function testEventStandings(base,output,contactOutput=output){
 await mkdir(output,{recursive:true})
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||existsSync('/usr/bin/google-chrome')?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/google-chrome'}:{})})
 try{
  const page=await browser.newPage();let enabled=true,fail=false,phase='shortlist',reads=0
  const row=(id,name,stars,status='submitted')=>({submission_id:id,organization_id:id,organization_slug:id,organization_name:name,title:name+' pitch',favorites:stars,status})
  await page.route('**/presentations/**',route=>{const url=new URL(route.request().url());if(url.pathname.endsWith('/public'))return route.fulfill({json:{enabled}});if(url.pathname.endsWith('/final-round'))return route.fulfill({json:{phase,results:[{submission_id:'a',votes:2},{submission_id:'b',votes:4}]}});if(url.pathname.endsWith('/submissions')){reads++;if(fail)return route.fulfill({status:503,json:{}});return route.fulfill({json:url.searchParams.has('after')?{submissions:[row('c','Coast Care',7),row('d','Declined team',99,'declined')],next:null}:{submissions:[row('a','Anchor Care',2),row('b','Bay Research',7)],next:'page-two'}})}return route.continue()})
  await page.goto(base+'/standings?brand=lifetech');const standings=page.getByRole('region',{name:'Current submissions and vote standings'});await expect(standings.locator('li')).toHaveCount(3)
  await expect(standings.locator('li').first()).toContainText('Bay Research');await expect(standings.locator('.event-standing-rank')).toHaveText(['1','1','3']);await expect(standings).not.toContainText('Declined team');expect(reads).toBe(2)
  await expect(standings.getByRole('link',{name:'View submissions & vote'})).toHaveAttribute('href','/events/demo-day?tab=submissions#submissions')
  const captures=[]
  for(const mode of ['light','dark'])for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await page.evaluate(mode=>document.documentElement.dataset.theme=mode,mode);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const name=`standings-${mode}-${width}.png`;await page.screenshot({path:join(output,name),fullPage:true});captures.push(name)}
  phase='open';await page.reload();await expect(standings).toContainText('Final-round votes');await expect(standings.locator('li').first()).toContainText('Bay Research');await expect(standings.locator('li').first()).toContainText('4 votes');await expect(standings.locator('li').last()).toContainText('Not a finalist')
  enabled=false;reads=0;await page.reload();await expect(standings).toHaveCount(0);expect(reads).toBe(0)
  enabled=true;fail=true;await page.reload();await expect(standings.getByRole('alert')).toBeVisible();fail=false;await standings.getByRole('button',{name:'Retry standings'}).click();await expect(standings.locator('li')).toHaveCount(3)
  phase='shortlist';await page.goto(base+'/events?brand=lifetech');await expect(standings.locator('li')).toHaveCount(3);await expect(standings).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.route('**/baltimore/upcoming_events.json',route=>route.fulfill({json:[]}))
  await page.route('**/orgs/public/*/events**',route=>route.fulfill({json:[{id:'fixture-event',slug:'demo-day',title:'LifeTech Demo Day',starts_at:'2099-01-01T18:00:00Z',ends_at:'2099-01-01T20:00:00Z',host_org_id:'fixture-org',medtechOwned:true,tags:['medtech']}]}))
  await page.goto(base+'/calendar-events?brand=lifetech');await expect(standings.locator('li')).toHaveCount(3);await expect(standings.getByRole('heading')).toContainText('LifeTech Demo Day');await page.getByRole('button',{name:'List',exact:true}).click();await expect(standings.locator('li')).toHaveCount(3)
  const sheet=await browser.newPage({viewport:{width:1500,height:1000}});await sheet.setContent('<style>body{font:14px sans-serif;background:#ddd;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0}img{width:100%;height:900px;object-fit:contain;object-position:top}</style>'+(await Promise.all(captures.map(async name=>`<figure><figcaption>${name}</figcaption><img src="data:image/png;base64,${(await readFile(join(output,name))).toString('base64')}"></figure>`))).join(''));await sheet.screenshot({path:join(contactOutput,'event-standings-contact.png'),fullPage:true})
  console.log('PASS: paginated submissions, star rankings and ties, final votes distinguished, disabled forms hidden, retry, actual events listing, desktop/mobile light/dark')
 }finally{await browser.close()}
}
