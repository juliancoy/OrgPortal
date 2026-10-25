import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {existsSync} from 'node:fs'

export async function testPosterDesign(base,output){
 const root=resolve(new URL('..',import.meta.url).pathname),cache=join(output,'poster-review');await mkdir(cache,{recursive:true})
 const bundle=await build({entryPoints:[join(root,'../org-worker/src/eventPoster.ts')],bundle:true,platform:'node',format:'esm',write:false,nodePaths:[join(root,'node_modules')],banner:{js:`import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(join(root,'package.json'))});`}})
 const modulePath=join(cache,'renderer.mjs');await writeFile(modulePath,bundle.outputFiles[0].contents)
 const {renderEventPoster}=await import(pathToFileURL(modulePath).href)
 const event={title:'Life sciences, in motion',description:'OPTIONAL_DESCRIPTION',starts_at:'2026-11-17T23:00:00Z',ends_at:'2026-11-18T01:00:00Z',location:'City Garage · Baltimore'}
 const brand={name:'LifeTech',tagline:'Health × Medicine × Biotech'},formats=['letter','postcard','social','letter-4up'],renders={}
 for(const format of formats){renders[format]=await renderEventPoster(event,'https://lifetech.fyi/events/demo',format,brand);if(renders[format].includes('OPTIONAL_DESCRIPTION'))throw Error('Description appears by default')}
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||existsSync('/usr/bin/google-chrome')?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/google-chrome'}:{})})
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}})
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url())
   if(url.pathname.endsWith('/flyer.svg'))return route.fulfill({contentType:'image/svg+xml',body:await renderEventPoster(event,'https://lifetech.fyi/events/demo',url.searchParams.get('format')||'letter',brand,'light',{elements:{description:{hidden:false}}})})
   return route.fulfill({json:url.pathname.endsWith('/poster-images')?[]:{}})
  })
  await page.goto(base+'/poster-review?brand=lifetech')
  await expect(page.getByLabel('Background',{exact:true})).toHaveValue('gradient')
  await page.getByLabel('Element',{exact:true}).selectOption('description')
  await expect(page.getByRole('checkbox',{name:'Show description',exact:true})).not.toBeChecked()
  const description=page.locator('.event-poster-preview [role="img"]').locator('[data-poster-element="description"]')
  await expect(description).toHaveAttribute('display','none')
  await page.getByRole('checkbox',{name:'Show description',exact:true}).check();await expect(description).toHaveAttribute('display','inline')
  await page.getByRole('checkbox',{name:'Show description',exact:true}).uncheck()
  await page.setViewportSize({width:390,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:join(output,'poster-editor-mobile.png'),fullPage:true})
  const contact=await browser.newPage({viewport:{width:1360,height:900}})
  await contact.setContent(`<style>body{margin:20px;background:#e8edf2;display:grid;grid-template-columns:repeat(4,1fr);gap:16px;font:16px Arial}figure{margin:0}figcaption{padding:12px;font-weight:bold}img{width:100%;height:520px;object-fit:contain;object-position:top}</style>`+formats.map(format=>`<figure><figcaption>${format}</figcaption><img src="data:image/svg+xml;base64,${Buffer.from(renders[format]).toString('base64')}"/></figure>`).join(''))
  await contact.screenshot({path:join(output,'contact-poster-design.png'),fullPage:true})
  console.log('PASS: default poster composition in all four formats, description opt-in in the real editor, mobile layout')
 }finally{await browser.close()}
}
