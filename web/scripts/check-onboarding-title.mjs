// Isolated browser fixture; no real accounts or organization writes.
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {OnboardingPage} from './src/ui/views/OnboardingPage';createRoot(document.getElementById('root')).render(<MemoryRouter><OnboardingPage/></MemoryRouter>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'/tmp/onboarding-fixture',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'context',setup(b){b.onResolve({filter:/AppProviders$|tasks\/TaskQueue$|auth\/sessionToken$|config\/timebankCommunity$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const useAuth=()=>({token:'fixture',user:{id:'fixture'}});export const useGroupSite=()=>({home_org_slug:'lifetech'});export const signalTasksChanged=()=>{};export const useTaskQueue=()=>({tasks:[]});export const refreshRuntimeTokenFromSession=async()=>null;`}))}}]})
let title='',scheme='corporation'
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname
 if(path.startsWith('/api/')){
  res.setHeader('Content-Type','application/json')
  if(path.endsWith('/title')){let raw='';for await(const chunk of req)raw+=chunk;title=JSON.parse(raw).title;res.end('{"ok":true}');return}
  res.end(JSON.stringify(path.endsWith('/scheme')?{scheme}:path.endsWith('/availability')?{start:'2026-10-23',end:'2026-10-30',slots:[],selected:[],suggested_slots:[]}:{enabled:true,organizationName:'Fixture',organizationId:'fixture',acknowledgements:{selected_title:title},steps:[]}));return
 }
 const file=bundle.outputFiles.find(f=>f.path.endsWith(path))
 if(file){res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');res.end(file.text);return}
 res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/stdin.css"><div id="root"></div><script src="/stdin.js"></script>')
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']})
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(`http://127.0.0.1:${server.address().port}`)
 const select=page.getByLabel('Title',{exact:true}),apply=page.getByRole('button',{name:'Apply',exact:true})
 await expect(select.locator('option[value="Manager"]')).toHaveCount(1)
 await expect(apply).toBeDisabled();await select.selectOption('Advisor');await apply.click()
 await expect(page.getByText('Saved title: Advisor',{exact:true})).toBeVisible()
 await page.reload();await expect(select).toHaveValue('Advisor')
 await select.selectOption('custom');await page.getByLabel('Your title',{exact:true}).fill('Community builder');await apply.click()
 await expect(page.getByText('Saved title: Community builder',{exact:true})).toBeVisible()
 await page.reload();await expect(page.getByLabel('Your title',{exact:true})).toHaveValue('Community builder')
 assert.equal(await apply.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(212, 175, 55)')
 assert.ok(await apply.evaluate(n=>n===n.closest('form').lastElementChild))
 for(const width of [1280,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
 scheme='nonprofit';title='';await page.reload();await expect(select.locator('option[value="Staff"]')).toHaveCount(1);await expect(select.locator('option[value="Manager"]')).toHaveCount(0)
 assert.deepEqual(errors,[])
 console.log('PASS: current scheme, custom title, Apply, persistence, gold button at bottom, desktop/mobile')
}finally{await browser.close();server.close()}
