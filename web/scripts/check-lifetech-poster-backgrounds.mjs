// Read-only check of the public poster tools and downloaded PNG dimensions.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {chromium} from '@playwright/test'
const origin=process.env.POSTER_ORIGIN || 'https://lifetech.fyi'
const slug=process.env.POSTER_EVENT || 'medtech-in-the-hut-2026-10-20'
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_BINARY?{executablePath:process.env.BROWSER_BINARY}:{}),args:['--no-sandbox']})
try {
 const page=await browser.newPage({acceptDownloads:true})
 await page.goto(`${origin}/events/${slug}`,{waitUntil:'domcontentloaded'})
 const editor=page.locator('.event-poster').first()
 await editor.or(page.getByRole('button',{name:'Create poster',exact:true})).first().waitFor({timeout:60000})
 if(!await editor.count())await page.getByRole('button',{name:'Create poster',exact:true}).click()
 await editor.locator('select').selectOption('lifetech')
 for(const [label,width,height] of [['8.5 x 11',2550,3300],['Letter 2 × 2',2550,3300],['4 x 6',1200,1800],['Social',1200,630]]){
  await editor.getByRole('button',{name:label,exact:true}).click()
  const button=editor.getByRole('button',{name:'Background PNG',exact:true})
  await button.waitFor()
  await page.waitForFunction(()=>{const e=document.querySelector('.event-poster');return e?.querySelector('.event-poster-actions button')?.disabled===false},{},{timeout:60000})
  const downloadPromise=page.waitForEvent('download',{timeout:60000})
  await button.click()
  const download=await downloadPromise
  const png=await readFile(await download.path())
  assert.equal(png.readUInt32BE(16),width);assert.equal(png.readUInt32BE(20),height)
  assert.match(download.suggestedFilename(),/-background\.png$/)
  console.log(label,`${width} × ${height}`, 'plain background PNG passed')
 }
 const svg=await (await fetch(`${origin}/api/org/api/network/events/public/${slug}/flyer.svg?format=letter&background=lifetech&backgroundOnly=true`)).text()
 assert.match(svg,/data:image\/png;base64,/);assert.doesNotMatch(svg,/<text|Scan to RSVP/)
} finally {await browser.close()}
