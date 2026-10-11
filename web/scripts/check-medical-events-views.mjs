import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_BINARY||'/usr/bin/google-chrome',args:['--no-sandbox']})
const medical=Array.from({length:72},(_,i)=>({name:`Medical research session ${i+1}`,startDate:'2030-10-08T15:00:00Z',url:`https://example.com/medical/${i+1}`,tags:['Medical']}))
const unrelated=[{name:'Public Ice Skating',startDate:'2030-10-08T15:00:00Z',url:'https://example.com/skating',tags:['Community']},{name:'Yoga',startDate:'2030-10-08T15:00:00Z',url:'https://example.com/yoga',tags:['Health']}]
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900},timezoneId:'America/New_York'}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/baltimore/upcoming_events.json',r=>r.fulfill({json:[...medical,...unrelated]}))
  await page.route('**/api/org/api/network/orgs/public/*/events?*',r=>r.fulfill({json:[]}))
  await page.goto((process.env.MAP_ORIGIN||'http://127.0.0.1:5193')+'/calendar')
  await page.getByRole('heading',{name:'October 2030'}).waitFor()
  assert.equal(await page.locator('.public-calendar-day-event').count(),72,'every event appears in the day')
  assert.equal(await page.locator('.public-calendar-day-more').count(),0)
  assert.equal(await page.locator('.community-events-columns').count(),0,'calendar view stands alone')
  assert.equal(await page.getByText('Public Ice Skating',{exact:true}).count(),0)
  assert.equal(await page.getByText('Yoga',{exact:true}).count(),0)
  const last=page.getByRole('link',{name:'Medical research session 72',exact:true});await last.scrollIntoViewIfNeeded();assert.ok(await last.isVisible())
  await page.getByRole('button',{name:'List',exact:true}).click()
  await page.locator('.community-events-columns').waitFor();assert.equal(await page.locator('.public-calendar-month').count(),0)
  assert.equal(await page.locator('.public-calendar-event-card').count(),72)
  assert.equal(new URL(page.url()).searchParams.get('view'),'list')
  await page.reload();await page.locator('.public-calendar-event-card').last().waitFor();assert.equal(await page.locator('.public-calendar-event-card').count(),72)
  await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.locator('.public-calendar-month').waitFor()
  await page.getByRole('heading',{name:'October 2030'}).waitFor();assert.equal(await page.locator('.public-calendar-day-event').count(),72)
  assert.deepEqual(errors,[]);console.log(`${width}px: medical-only calendar, all 72 daily events, separate list, and URL restoration verified`);await page.close()
 }
}finally{await browser.close()}
