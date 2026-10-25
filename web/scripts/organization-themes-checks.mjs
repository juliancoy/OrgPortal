import {chromium,expect} from '@playwright/test'
import {join} from 'node:path'
import {mkdir,readFile} from 'node:fs/promises'
export async function testOrganizationThemes(base, output, contactOutput=output) {
 await mkdir(output,{recursive:true})
 const captures=[]
 const browser=await chromium.launch({headless:true, ...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})})
 try {
  for(const width of [390,1440])for(const mode of ['light','dark']) {
   const context=await browser.newContext({viewport:{width,height:1000},colorScheme:mode})
   const page=await context.newPage()
   await page.route('**/*',route=>route.request().url().startsWith(base) && ['GET','HEAD','OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort())
   await page.goto(base+'/settings?brand=lifetech&customThemes=1')
   await expect(page.getByRole('combobox',{name:'Organization theme',exact:true})).toHaveValue('ocean')
   await page.getByRole('combobox',{name:'Select color theme',exact:true}).selectOption('system')
   const colors=()=>page.evaluate(()=>{const c=getComputedStyle(document.documentElement);return ['--primary','--btn-primary-bg','--surface','--text-primary'].map(k=>c.getPropertyValue(k).trim())})
   expect(await colors()).toEqual(mode==='dark'?['#88CCFF','#88CCFF','#102030','#F0FAFF']:['#005588','#005588','#F0FAFF','#102030'])
   await page.screenshot({path:join(output,`organization-themes-${width}-${mode}.png`),fullPage:true})
   captures.push({name:`Settings ${width}px ${mode}`,file:`organization-themes-${width}-${mode}.png`})
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
   await page.getByRole('combobox',{name:'Organization theme',exact:true}).selectOption('forest')
   expect((await colors())[0]).toBe(mode==='dark'?'#88CC88':'#245524')
   await page.reload()
   await expect(page.getByRole('combobox',{name:'Organization theme',exact:true})).toHaveValue('forest')
   await page.getByRole('combobox',{name:'Select color theme',exact:true}).selectOption('light')
   expect((await colors())[0]).toBe('#245524')
   await page.getByRole('combobox',{name:'Select color theme',exact:true}).selectOption('dark')
   expect((await colors())[0]).toBe('#88CC88')
   await page.goto(base+'/branding?brand=lifetech&customThemes=1')
   await page.getByRole('combobox',{name:'Brand guide theme'}).selectOption('forest')
   await page.getByRole('combobox',{name:'Brand guide color mode'}).selectOption('dark')
   await expect(page.getByRole('button',{name:'Copy Forest dark: primary color #88CC88',exact:true})).toBeVisible()
   await page.getByRole('combobox',{name:'Brand guide theme'}).selectOption('ocean')
   await expect(page.getByText('Pairings use Ocean in dark mode from the portal palette.')).toBeVisible()
   const download=page.waitForEvent('download')
   await page.getByRole('button',{name:'Download style guide (PNG)',exact:true}).click()
   expect((await download).suggestedFilename()).toBe('lifetech-color-style-guide.png')
   await page.locator('[aria-labelledby="tenant-brand-colors-title"]').screenshot({path:join(output,`organization-palette-${width}-${mode}.png`)})
   captures.push({name:`Palette ${width}px ${mode}`,file:`organization-palette-${width}-${mode}.png`})
   await page.goto(base+'/settings?brand=lifetech')
   await expect(page.getByRole('combobox',{name:'Organization theme',exact:true})).toHaveCount(0)
   expect(await page.evaluate(()=>document.getElementById('organization-theme-colors'))).toBe(null)
   await context.close()
  }
  const contact=await browser.newPage({viewport:{width:1280,height:1600}})
  const tiles=await Promise.all(captures.map(async capture=>`<figure><figcaption>${capture.name}</figcaption><img src="data:image/png;base64,${(await readFile(join(output,capture.file))).toString('base64')}" /></figure>`))
  await contact.setContent(`<style>body{margin:16px;background:#e8edf2;font:16px Arial;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0;min-width:0}figcaption{padding:10px;font-weight:bold}img{width:100%;height:700px;object-fit:cover;object-position:top;background:white}</style>${tiles.join('')}`)
  await contact.screenshot({path:join(contactOutput,'contact-organization-themes.png'),fullPage:true})
  await contact.close()
  console.log('PASS: named themes, harmonized portal colors, system light/dark, persisted selection, guide mappings and theme reset at desktop/mobile')
 } finally {await browser.close()}
}
