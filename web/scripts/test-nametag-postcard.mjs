import react from '@vitejs/plugin-react'
import {createServer} from 'vite'
import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const root=fileURLToPath(new URL('..',import.meta.url))
const output=resolve(root,'../artifacts/nametag-postcard')
await mkdir(output,{recursive:true})
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ConferenceNametag}from'/src/ui/components/ConferenceNametag.tsx';
createRoot(document.getElementById('root')).render(React.createElement(ConferenceNametag,{name:'Alex Example',avatarUrl:'',publicPageUrl:'https://lifetech.fyi/users/alex-example',websiteUrl:'https://example.com/',endeavours:'Synthetic local print fixture'}));
</script></body></html>`
const server=await createServer({root,configFile:false,cacheDir:'/tmp/nametag-postcard-vite',plugins:[react(),{name:'postcard-fixture',configureServer(server){server.middlewares.use('/nametag-postcard-review',async(req,res,next)=>{try{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/nametag-postcard-review',html))}catch(error){next(error)}})}}],server:{host:'127.0.0.1',port:0}})
let browser
try{
 await server.listen()
 const base='http://127.0.0.1:'+server.httpServer.address().port
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/google-chrome'})
 const page=await browser.newPage({viewport:{width:1000,height:1000}})
 await page.goto(base+'/nametag-postcard-review')
 const button=page.getByRole('button',{name:'Print credit-card pair on 4 × 6',exact:true})
 await expect(button).toBeEnabled()
 await page.getByLabel('Other endeavours').fill('Updated local print fixture')
 await page.getByRole('textbox',{name:'Personal website',exact:true}).fill('https://example.org/connect')
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
 await button.click()
 await page.waitForFunction(()=>window.printedPostcard)
 const printHtml=await page.evaluate(()=>window.printedPostcard)
 const printPage=await browser.newPage()
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
 await expect(sheet).toContainText('Updated local print fixture')
 await expect(sheet).toContainText('example.org/connect')
 if(await printPage.locator('button,fieldset').count())throw Error('Controls must not appear in print output')
 const pdf=await printPage.pdf({preferCSSPageSize:true,printBackground:true,path:resolve(output,'combined-4x6.pdf')})
 const pages=[...pdf.toString('latin1').matchAll(/\/Type \/Page\b/g)].length
 if(pages!==1||!pdf.includes(Buffer.from('288 432')))throw Error('Expected one 288 × 432 point PDF page (4 × 6 inches)')
 await sheet.screenshot({path:resolve(output,'combined-4x6.png')})
 await page.setViewportSize({width:390,height:900})
 await page.screenshot({path:resolve(output,'mobile-controls.png'),fullPage:true})
 // Invalid destinations cannot initiate printing, including the combined action.
 await page.getByRole('combobox',{name:/QR destination/}).selectOption('website')
 await page.getByRole('textbox',{name:'Personal website',exact:true}).fill('invalid')
 await expect(button).toBeDisabled()
 await writeFile(resolve(output,'result.json'),JSON.stringify({passed:true,pages,sheetInches:[4,6],sideMillimeters:[85.6,53.98],checks:['front above back','updated preview values','print controls excluded','invalid destination disabled']},null,2))
 console.log('PASS: one 4 × 6 inch PDF page with both credit-card sized sides, edited preview values and no controls.')
}finally{await browser?.close();await server.close()}
