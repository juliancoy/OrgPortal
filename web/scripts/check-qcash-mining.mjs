import {fixtureServer} from './fixture-server.mjs'
import {chromium,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const output=resolve(process.argv[2]||root+'/../artifacts/layout-review/qcash-mining')
await mkdir(output,{recursive:true})
let unavailable=false,requests=0
const network={currency:'QCash',name:'QCash Testnet',chainId:'ab'.repeat(32),height:42,tip:'cd'.repeat(32),decimals:0,experimental:true}
const {server,base}=await fixtureServer(root,output,0,{localOnly:true,apiResponse:async url=>{
 if(url.pathname.endsWith('/api/qcash/network')){requests++;return unavailable?{status:503,json:{error:'Unavailable'}}:{json:network}}
}})
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome'})
const report=[]
try{
 for(const theme of ['light','dark'])for(const width of [390,1440]){
  unavailable=false
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme,permissions:['clipboard-read','clipboard-write']})
  await context.addInitScript(theme=>localStorage.setItem('orgportal.theme',theme),theme)
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort())
  await page.goto(base+'/finance')
  await page.getByRole('link',{name:'Mining',exact:true}).click()
  await expect(page.getByRole('heading',{name:'QCash Mining',exact:true})).toBeVisible()
  await expect(page.getByText('QCash Testnet · Last checked height 42')).toBeVisible()
  await expect(page.getByText('Public miner connection unavailable.',{exact:true})).toBeVisible()
  await expect(page.getByText('Local QPU simulator available.',{exact:true})).toBeVisible()
  await expect(page.getByRole('link',{name:'Run the local simulator',exact:true})).toHaveAttribute('href','https://github.com/juliancoy/QCash/tree/main/miners#local-qpu-simulation')
  const copy=page.getByRole('button',{name:'Copy mining command'});await expect(copy).toBeDisabled()
  const address=page.getByLabel('Public QCash reward address')
  await address.fill('$(touch /tmp/no)');await expect(copy).toBeDisabled();await expect(page.getByRole('alert')).toBeVisible()
  await address.fill('cd'.repeat(32));await expect(copy).toBeEnabled();await copy.click()
  await expect(page.getByText('Mining command copied. Run it locally when you are ready.')).toBeVisible()
  const copied=await page.evaluate(()=>navigator.clipboard.readText())
  if(copied!==`./build/qcash node node-home 127.0.0.1:29600 --mine-to ${'cd'.repeat(32)} --mine-interval 5`)throw Error('Wrong copied command')
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal overflow')
  await page.screenshot({path:output+`/mining-${width}-${theme}.png`,fullPage:true})
  unavailable=true;await page.getByRole('button',{name:'Refresh network'}).click()
  await expect(page.getByRole('status')).toContainText('testnet is unavailable')
  await expect(page.getByRole('heading',{name:'Conventional machines',exact:true})).toBeVisible()
  unavailable=false;await page.getByRole('button',{name:'Refresh network'}).click()
  await expect(page.getByText('QCash Testnet · Last checked height 42')).toBeVisible()
  if(errors.length)throw Error(errors.join('\n'))
  report.push({width,theme,copy:true,validation:true,unavailableRecovery:true,noOverflow:true,errors});await context.close()
 }
 await writeFile(output+'/verification.json',JSON.stringify({requests,cases:report},null,2)+'\n')
 console.log('QCash mining browser checks passed:',report.length,'layouts')
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
