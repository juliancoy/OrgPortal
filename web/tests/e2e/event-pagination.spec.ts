import {expect,test} from '@playwright/test'

test('events load a small first page, append on demand and preserve results across retry',async({page})=>{
 await page.route('**/api/org/**',route=>route.fulfill({json:[]}))
 await page.route('**/api/org/api/portal/site',route=>route.fulfill({json:{id:'local-events',hostname:'localhost',name:'OrgPortal',profile:'community',features:['directory','events','chat'],accent_color:'#155e59'}}))
 await page.route('**/auth/session-token',route=>route.fulfill({status:401,json:{detail:'Signed out'}}))
 await page.route('**/auth/me',route=>route.fulfill({status:401,json:{detail:'Signed out'}}))
 const offsets:number[]=[]
 let fail=true
 await page.route('**/api/org/api/network/events/recommended?**',route=>{
  const params=new URL(route.request().url()).searchParams
  expect(params.get('limit')).toBe('25')
  const offset=Number(params.get('offset'));offsets.push(offset)
  if(offset===25&&fail)return route.fulfill({status:503,body:'Temporary event feed failure'})
  const count=offset===0?25:2
  return route.fulfill({json:Array.from({length:count},(_,i)=>({id:`event-${offset+i}`,slug:`event-${offset+i}`,title:`Ranked event ${offset+i}`,starts_at:'2099-01-01T12:00:00Z'}))})
 })
 await page.goto('/events')
 const cards=page.locator('.public-event-list-card')
 await expect(cards).toHaveCount(25)
 // Development StrictMode may abort and restart the initial effect.
 expect(offsets.length).toBeGreaterThan(0)
 expect(offsets.every(offset=>offset===0)).toBe(true)
 const initialRequests=offsets.length
 await expect(cards.first()).toContainText('Ranked event 0')
 await page.getByRole('button',{name:'Load more events',exact:true}).click()
 await expect(page.getByRole('alert')).toHaveText('Temporary event feed failure')
 await expect(cards).toHaveCount(25)
 fail=false
 await page.getByRole('button',{name:'Retry loading events',exact:true}).click()
 await expect(cards).toHaveCount(27)
 await expect(cards.last()).toContainText('Ranked event 26')
 await expect(page.getByRole('button',{name:'Load more events',exact:true})).toHaveCount(0)
 expect(offsets.slice(initialRequests)).toEqual([25,25])
})
