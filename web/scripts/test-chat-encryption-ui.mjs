// Real components/crypto, synthetic identity/APIs, served by isolated local Docker.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const output = fileURLToPath(new URL('../../artifacts/layout-review/chat-encryption/', import.meta.url))
await mkdir(output, {recursive:true})
const bundle = await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route} from 'react-router-dom';import {NativeChatPage} from './src/ui/views/chat/NativeChatPage';createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path='/chat/:roomId' element={<NativeChatPage/>}/></Routes></BrowserRouter>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,outfile:'app.js',format:'iife',jsx:'automatic',define:{'import.meta.env':JSON.stringify({BASE_URL:'/'})},plugins:[{name:'synthetic-identity',setup(b){b.onResolve({filter:/(?:^|\/)AppProviders$/},()=>({path:'identity',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export function useAuth(){return {token:'synthetic-local-only',user:{id:'alice',displayName:'Synthetic Admin'}}}`}))}}]})
await writeFile(`${output}/app.js`,bundle.outputFiles[0].contents)
let css = ''
for (const path of ['public/css/master.css','src/index.css','src/styles/theme-foundation.css','src/styles/themes/orgportal.css','src/styles/layout.css']) css += await readFile(root+path,'utf8')+'\n'
await writeFile(`${output}/style.css`,css)
await writeFile(`${output}/index.html`,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>')
await writeFile(`${output}/nginx.conf`,'events {} http { include /etc/nginx/mime.types; server { listen 8080; root /usr/share/nginx/html; location / { try_files $uri /index.html; } } }')
const container = execFileSync('docker',['run','--rm','-d','--read-only','--user','101:101','--tmpfs','/var/cache/nginx:uid=101,gid=101,mode=0700','--tmpfs','/var/run:uid=101,gid=101,mode=0700','--cap-drop=ALL','--security-opt=no-new-privileges','-p','127.0.0.1::8080','-v',`${output}:/usr/share/nginx/html:ro`,'-v',`${output}/nginx.conf:/etc/nginx/nginx.conf:ro`,'--entrypoint','nginx','nginx:alpine','-g','daemon off;'],{encoding:'utf8'}).trim()
let browser
try {
  const port = execFileSync('docker',['port',container,'8080'],{encoding:'utf8'}).trim().split(':').at(-1)
  const origin = `http://127.0.0.1:${port}`
  for(let attempt=0;attempt<30;attempt++){try{if((await fetch(origin)).ok)break}catch{} await new Promise(resolve=>setTimeout(resolve,100))}
  browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/google-chrome',args:['--no-sandbox']})
  const context = await browser.newContext({viewport:{width:1280,height:1000},serviceWorkers:'block'})
  const page = await context.newPage(), errors=[], sends=[], changes=[]
  page.setDefaultTimeout(15000)
  page.on('pageerror',error=>errors.push(error.message))
  let mode='none', revision=0, devices=[], admin=true, missing=[], failSave=false, delaySave=false
  const conversation=()=>({id:'room-a',kind:'dm',title:'Research chat',updated_at:'2026-10-31T12:00:00Z',encryption_mode:mode,encryption_revision:revision,members:[{user_id:'alice',user_name:'Synthetic Admin',role:'owner',state:'active'}]})
  const state=()=>({mode,revision,current_user_id:'alice',can_manage:admin,devices,missing_members:missing})
  await page.routeWebSocket('**/*',socket=>{socket.send(JSON.stringify({type:'connected'}))})
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url())
    if(url.origin!==origin)return route.abort()
    if(!url.pathname.startsWith('/api/'))return route.continue()
    const reply=body=>route.fulfill({json:body})
    if(url.pathname.endsWith('/security')){
      if(request.method()==='PATCH'){
        const data=request.postDataJSON();changes.push(data)
        if(delaySave)await new Promise(resolve=>setTimeout(resolve,800))
        if(failSave){failSave=false;return route.fulfill({status:503,json:{detail:'Synthetic save failure'}})}
        assert.equal(data.expected_revision,revision);mode=data.mode;revision++
      }
      return reply(state())
    }
    if(url.pathname.endsWith('/devices') && request.method()==='POST'){
      const key=request.postDataJSON();assert.ok(!('d' in key.rsa_jwk));assert.ok(!('kem_seed' in key))
      if(!devices.some(d=>d.device_id===key.device_id)){devices.push(key);revision++}
      return reply({device_id:key.device_id})
    }
    if(url.pathname.includes('/devices/') && request.method()==='DELETE'){devices=[];revision++;return reply({ok:true})}
    if(url.pathname.endsWith('/conversations'))return reply({conversations:[conversation()]})
    if(url.pathname.endsWith('/conversations/room-a'))return reply({conversation:conversation()})
    if(url.pathname.endsWith('/messages') && request.method()==='POST'){
      const data=request.postDataJSON();sends.push(data)
      assert.equal(Boolean(data.encryption),mode!=='none')
      return reply({message:{...data,id:`message-${sends.length}`,conversation_id:'room-a',sender_user_id:'alice',created_at:'2026-10-31T12:00:00Z',body:data.encryption?'Encrypted message':data.body}})
    }
    if(url.pathname.endsWith('/messages'))return reply({messages:[{id:'old',conversation_id:'room-a',sender_user_id:'alice',body:'Earlier message',created_at:'2026-10-30T12:00:00Z'}],latest_sequence:0})
    if(url.pathname.endsWith('/sync'))return reply({messages:[],latest_sequence:0})
    if(url.pathname.endsWith('/presence'))return reply({presence:[]})
    if(url.pathname === '/api/org/api/network/orgs')return reply([])
    if(url.pathname === '/api/org/api/network/users')return reply([])
    if(url.pathname.endsWith('/read'))return reply({ok:true})
    if(url.pathname.includes('/timebank/'))return reply({groups:[]})
    errors.push(`Unmocked request: ${request.method()} ${url.pathname}`)
    return route.fulfill({status:500,json:{detail:'Unmocked fixture request'}})
  })
  await page.goto(`${origin}/chat/room-a`)
  console.log('Opened synthetic chat')
  const protection=page.getByRole('region',{name:'Chat encryption'})
  await protection.getByText('Chat protection',{exact:true}).click()
  const select=page.getByRole('combobox',{name:'Encryption for new messages'})
  await select.waitFor()
  for(const [value,color] of [['none','blue'],['rsa','green'],['rsa-mlkem','purple']]){
    console.log('Checking mode',value)
    if(value!=='none'){
      await select.selectOption(value)
      await protection.getByRole('status').filter({hasText:'Saved'}).waitFor()
    }
    await protection.locator(`.chat-encryption-dot.chat-encryption-${color}`).waitFor()
    const secret=`Message using ${value}`
    await page.getByRole('textbox',{name:'Message',exact:true}).fill(secret)
    await page.getByRole('button',{name:'Send',exact:true}).click()
    await page.locator('.portal-chat-message').getByText(secret,{exact:true}).waitFor()
    await page.locator('.portal-chat-message').filter({hasText:secret}).locator(`.chat-encryption-${color}`).waitFor()
    const sent=sends.at(-1)
    if(value!=='none'){assert.equal(sent.body,undefined);assert.ok(!JSON.stringify(sent).includes(secret));assert.equal(sent.encryption.mode,value)}
    for(const [width,theme] of [[1280,'light'],[1280,'dark'],[390,'light'],[390,'dark']]){
      await page.setViewportSize({width,height:1000})
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme)
      if(width===390 && await page.getByRole('button',{name:'Collapse conversations'}).count()) await page.getByRole('button',{name:'Collapse conversations'}).click()
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${value} overflows ${width}`)
      await page.screenshot({path:`${output}/${color}-${width}-${theme}.png`,fullPage:true})
    }
  }
  // Failed saves keep the confirmed badge and expose retry.
  failSave=true
  await select.selectOption('rsa')
  await page.getByRole('button',{name:'Retry protection change'}).waitFor()
  await protection.locator('.chat-encryption-purple.chat-encryption-dot').waitFor()
  await page.getByRole('button',{name:'Retry protection change'}).click()
  await protection.locator('.chat-encryption-green.chat-encryption-dot').waitFor()
  // An edit made while a save is running must be saved afterwards.
  delaySave=true
  await select.selectOption('rsa-mlkem')
  await protection.getByText('Saving chat protection…',{exact:true}).waitFor()
  await select.selectOption('none')
  await protection.locator('.chat-encryption-blue.chat-encryption-dot').waitFor()
  assert.equal(mode,'none');delaySave=false
  // Queue several messages while device readiness is pending.
  mode='rsa-mlkem';revision++;missing=['bob'];admin=false
  await page.reload()
  await page.getByText('Chat protection',{exact:true}).click()
  await page.getByText(/Waiting for 1 member/).waitFor()
  assert.equal(await page.getByRole('combobox',{name:'Encryption for new messages'}).count(),0)
  const sentBefore=sends.length
  for(const body of ['Queued first','Queued second','Cancel this message']){
    await page.getByRole('textbox',{name:'Message',exact:true}).fill(body)
    await page.getByRole('button',{name:'Send',exact:true}).click()
    await page.locator('.portal-chat-message').filter({hasText:body}).getByRole('button',{name:'Cancel queued message'}).waitFor()
  }
  assert.equal(sends.length,sentBefore)
  assert.equal(sends.length,sentBefore) // Recipient keys are still pending.
  await page.reload()
  await page.locator('.portal-chat-message').filter({hasText:'Queued first'}).waitFor()
  await page.locator('.portal-chat-message').filter({hasText:'Cancel this message'}).getByRole('button',{name:'Cancel queued message'}).click()
  await page.locator('.portal-chat-message').filter({hasText:'Cancel this message'}).waitFor({state:'detached'})
  mode='rsa';revision++;missing=[]
  await page.reload()
  await page.locator('.portal-chat-message').filter({hasText:'Queued first'}).waitFor()
  await page.waitForTimeout(400)
  assert.equal(sends.length,sentBefore) // No silent security downgrade.
  mode='rsa-mlkem';revision++
  await page.reload()
  await page.locator('.portal-chat-message').filter({hasText:'Queued second'}).locator('.chat-encryption-purple').waitFor()
  assert.equal(sends.length,sentBefore+2)
  assert.ok(sends.slice(sentBefore).every(item=>item.body===undefined && item.encryption.mode==='rsa-mlkem'))
  assert.equal(await page.getByRole('button',{name:'Cancel queued message'}).count(),0)
  assert.deepEqual(errors,[])
  await writeFile(`${output}/report.json`,JSON.stringify({passed:true,modes:['none','rsa','rsa-mlkem'],sends:sends.length,policyChanges:changes.length,checks:['ciphertext-only transport','browser decryption','per-message history badges','autosave retry','edits during save','administrator controls','encrypted durable queue','ordered automatic delivery','cancellation','no silent downgrade','responsive light/dark']},null,2))
  console.log('Chat encryption Docker clickthrough passed; screenshots:',output)
  await context.close()
} finally {
  if(browser)await browser.close()
  try { execFileSync('docker',['stop',container],{stdio:'ignore'}) } catch {}
}
