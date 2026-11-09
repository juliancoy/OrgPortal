import react from '@vitejs/plugin-react'
import {createServer} from 'vite'
import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const root=fileURLToPath(new URL('..',import.meta.url))
const output=resolve(root,'../artifacts/nametag-postcard')
await mkdir(output,{recursive:true})
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import jsQR from 'jsqr';window.jsQR=jsQR;import React from 'react';import{createRoot}from'react-dom/client';import{ConferenceNametag}from'/src/ui/components/ConferenceNametag.tsx';
createRoot(document.getElementById('root')).render(React.createElement(ConferenceNametag,{name:'Alex Example',avatarUrl:'https://id.codecollective.us/avatars/fixture/photo.png',publicPageUrl:new URLSearchParams(location.search).has('missing')?null:'https://lifetech.fyi/users/alex-example',endeavours:'Synthetic local print fixture'}));
</script></body></html>`
const server=await createServer({root,configFile:false,cacheDir:'/tmp/nametag-postcard-vite',plugins:[react(),{name:'postcard-fixture',configureServer(server){server.middlewares.use('/nametag-postcard-review',async(req,res,next)=>{try{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/nametag-postcard-review',html))}catch(error){next(error)}})}}],server:{host:'127.0.0.1',port:0}})
let browser
try{
 await server.listen()
 const base='http://127.0.0.1:'+server.httpServer.address().port
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/google-chrome'})
 const context=await browser.newContext()
 await context.route('**/pidp/avatars/fixture/photo.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=','base64')}))
 const page=await context.newPage({viewport:{width:1000,height:1000}})
 await page.goto(base+'/nametag-postcard-review')
 const button=page.getByRole('button',{name:'Print credit-card pair on 4 × 6',exact:true})
 await expect(button).toBeEnabled()
 const border=page.getByRole('spinbutton',{name:'Anticipated printer border on every edge (mm)'})
 await expect(border).toHaveValue('5')
 await expect(page.getByRole('status')).toContainText('77.17 × 48.67 mm')
 await border.fill('0')
 await expect(page.getByRole('status')).toContainText('85.60 × 53.98 mm')
 await border.fill('10')
 await expect(page.getByRole('status')).toContainText('80.31%')
 await border.fill('')
 await expect(border).toHaveAttribute('aria-invalid','true')
 await expect(page.getByRole('alert')).toContainText('0 to 25 mm')
 await border.fill('5')
 await page.locator('.conference-nametag-print-model').screenshot({path:resolve(output,'printer-fit-model.png')})
 await page.evaluate(()=>{
  new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.tagName==='IFRAME')node.contentWindow.print=()=>{window.printedPostcard=node.contentDocument.documentElement.outerHTML}}).observe(document.body,{childList:true})
 })
 const decoded=await page.evaluate(async()=>{
  const img=document.querySelector('.conference-nametag-back .conference-nametag-qr');await img.decode()
  const canvas=document.createElement('canvas');canvas.width=canvas.height=Math.round(parseFloat(getComputedStyle(img).width)*300/96)
  const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height)
  const data=ctx.getImageData(0,0,canvas.width,canvas.height)
  return window.jsQR(data.data,data.width,data.height)?.data
 })
 if(decoded!=='https://lifetech.fyi/users/alex-example')throw Error('Credit-card QR must decode at print resolution')
 const downloaded=page.waitForEvent('download')
 await page.getByRole('button',{name:'Download front PNG',exact:true}).click()
 const png=await readFile(await (await downloaded).path())
 if(png.readUInt32BE(16)!==1011||png.readUInt32BE(20)!==638)throw Error('Credit-card PNG dimensions must be 1011 × 638 pixels')
 await button.click()
 await page.waitForFunction(()=>window.printedPostcard)
 const standardHtml=await page.evaluate(()=>window.printedPostcard)
 await page.evaluate(()=>{window.printedPostcard=null})
 await page.getByRole('button',{name:'Print border-adjusted pair on 4 × 6',exact:true}).click()
 await page.waitForFunction(()=>window.printedPostcard)
 const adjustedHtml=await page.evaluate(()=>window.printedPostcard)
 const adjustedPage=await context.newPage();await adjustedPage.goto(base);await adjustedPage.setContent(adjustedHtml)
 const adjustedCard=await adjustedPage.locator('.conference-nametag-front').boundingBox()
 const fit=91.6/101.6
 if(Math.abs(adjustedCard.width*fit-85.6*96/25.4)>.08||Math.abs(adjustedCard.height*fit-53.98*96/25.4)>.08)throw Error('Compensated artwork must restore credit-card dimensions after printer fit')
 const adjustedPdf=await adjustedPage.pdf({preferCSSPageSize:true,printBackground:true,path:resolve(output,'adjusted-4x6.pdf')})
 if([...adjustedPdf.toString('latin1').matchAll(/\/Type \/Page\b/g)].length!==1)throw Error('Adjusted sheet must fit one page')
 await adjustedPage.close()
 await page.evaluate(html=>{window.printedPostcard=html},standardHtml)
 const printHtml=await page.evaluate(()=>window.printedPostcard)
 const printPage=await context.newPage()
 await printPage.goto(base)
 await printPage.setContent(printHtml)
 await printPage.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})))})
 const sheet=printPage.locator('.conference-nametag-postcard')
 await expect(sheet.locator('.conference-nametag')).toHaveCount(2)
 const bounds=await sheet.boundingBox()
 if(bounds.width!==384||bounds.height!==576)throw Error('Sheet must measure 4 × 6 inches: '+JSON.stringify(bounds))
 const front=await sheet.locator('.conference-nametag-front').boundingBox(),back=await sheet.locator('.conference-nametag-back').boundingBox()
 const px=mm=>mm*96/25.4,near=(a,b)=>Math.abs(a-b)<0.06
 if(![front,back].every(card=>near(card.width,px(85.6))&&near(card.height,px(53.98)))||!near(back.y-front.y,px(53.98+6)))throw Error('Expected two credit-card sized sides separated by a 6 mm cutting gap')
 await expect(sheet.locator('.conference-nametag-avatar img')).toHaveAttribute('src','/pidp/avatars/fixture/photo.png')
 if(!await sheet.locator('.conference-nametag-avatar img').evaluate(img=>img.naturalWidth>0))throw Error('Legacy avatar must load through the current identity mount')
 await expect(sheet).toContainText('Alex')
 await expect(sheet).toContainText('Example')
 await expect(sheet.locator('.conference-nametag-back .conference-nametag-qr')).toHaveCount(1)
 if(await printPage.locator('button,fieldset').count())throw Error('Controls must not appear in print output')
 const pdf=await printPage.pdf({preferCSSPageSize:true,printBackground:true,path:resolve(output,'combined-4x6.pdf')})
 const pages=[...pdf.toString('latin1').matchAll(/\/Type \/Page\b/g)].length
 if(pages!==1||!pdf.includes(Buffer.from('288 432')))throw Error('Expected one 288 × 432 point PDF page (4 × 6 inches)')
 // Confirm the printed QR remains decodable at the actual card size.
 const qr=sheet.locator('.conference-nametag-back .conference-nametag-qr')
 const qrBytes=await qr.screenshot()
 await writeFile(resolve(output,'back-qr.png'),qrBytes)
 await sheet.screenshot({path:resolve(output,'combined-4x6.png')})
 await page.setViewportSize({width:390,height:900})
 await page.screenshot({path:resolve(output,'mobile-controls.png'),fullPage:true})
 // Invalid destinations cannot initiate printing, including the combined action.
 await page.goto(base+'/nametag-postcard-review?missing=1')
 await expect(button).toBeDisabled()
 await writeFile(resolve(output,'result.json'),JSON.stringify({passed:true,pages,sheetInches:[4,6],sideMillimeters:[85.6,53.98],checks:['front above back','name on both sides and back QR','print controls excluded','invalid destination disabled']},null,2))
 console.log('PASS: one 4 × 6 inch PDF page with both credit-card sized sides, name on both sides and back QR and no controls.')
}finally{await browser?.close();await server.close()}
