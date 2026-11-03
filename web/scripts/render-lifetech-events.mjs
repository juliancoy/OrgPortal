import {fixtureServer} from './fixture-server.mjs'
import {fixtureData} from './layout-review/data.mjs'
import {renderLayouts} from './render-layouts.mjs'
import {mkdir,writeFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {chromium} from '@playwright/test'
const root=resolve(import.meta.dirname,'..'),output=resolve(process.argv[2]||resolve(root,'../artifacts/layout-review/lifetech-events'))
await mkdir(output,{recursive:true})
const requests=[]
const {server,base}=await fixtureServer(root,output,0,{localOnly:true,apiResponse:async url=>{
 if(!url.pathname.endsWith('/events/recommended'))return
 requests.push(Object.fromEntries(url.searchParams))
 let rows=fixtureData(url.pathname,new URLSearchParams())
 const category=url.searchParams.get('category'),query=url.searchParams.get('q')?.toLowerCase()
 if(category==='community')rows=rows.filter(row=>row.community_event)
 if(category==='biotech')rows=rows.filter(row=>/biotech/i.test(row.title))
 if(query)rows=rows.filter(row=>`${row.title} ${row.description}`.toLowerCase().includes(query))
 if(url.searchParams.get('from'))rows=rows.filter(row=>Date.parse(row.starts_at)>=Date.parse(url.searchParams.get('from'))&&Date.parse(row.starts_at)<Date.parse(url.searchParams.get('to')))
 if(url.searchParams.get('period')==='past')rows=[]
 const offset=Number(url.searchParams.get('offset')),limit=Number(url.searchParams.get('limit'))
 return {json:rows.slice(offset,offset+limit)}
}})
try {
 const report=await renderLayouts([
  {name:'LifeTech discovery',url:base+'/calendar-events?brand=lifetech&viewer=visitor',ready:'.lte-featured'},
  {name:'LifeTech event list',url:base+'/calendar-events?brand=lifetech&viewer=visitor',ready:'.lte-card',selector:'.lte-content'},
  {name:'LifeTech calendar',url:base+'/calendar-events?brand=lifetech&viewer=visitor&view=calendar&month=2027-01',ready:'.lte-day a'},
  {name:'LifeTech empty search',url:base+'/calendar-events?brand=lifetech&viewer=visitor&q=no-matching-events',ready:'.lte-empty'},
 ],output)
 if(report.some(row=>row.error||row.overflow||row.errors.length))throw Error('Layout rendering found errors or overflow')
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH||existsSync('/usr/bin/google-chrome')?{executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome'}:{})})
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}})
  await page.goto(base+'/calendar-events?brand=lifetech&viewer=visitor')
  await page.locator('.lte-featured').waitFor()
  await page.getByRole('button',{name:'LifeTech community',exact:true}).click()
  await page.locator('.lte-card h3').filter({hasText:'LifeTech Demo Day'}).waitFor()
  await page.waitForFunction(()=>document.querySelectorAll('.lte-card').length===1)
  await page.getByRole('button',{name:'All events',exact:true}).click()
  await page.getByRole('searchbox',{name:'Search events'}).fill('better care')
  await page.locator('.lte-card h3').filter({hasText:'Building better care'}).waitFor()
  await page.getByRole('button',{name:'Calendar',exact:true}).click()
  await page.getByRole('button',{name:'Next month',exact:true}).click()
  await page.getByRole('button',{name:'Discover',exact:true}).click()
  await page.getByRole('searchbox',{name:'Search events'}).fill('nothing-matches')
  await page.locator('.lte-empty').waitFor()
  await page.getByRole('button',{name:'Clear filters',exact:true}).click()
  await page.locator('.lte-featured').waitFor()
  if(requests.some(request=>Number(request.limit)!==25))throw Error('An event request exceeded the page size')
  await writeFile(resolve(output,'interactions.json'),JSON.stringify({communityFilter:true,search:true,calendarNavigation:true,emptyRecovery:true,requests},null,2))
 } finally {await browser.close()}
}finally{await new Promise(resolve=>server.close(resolve))}
