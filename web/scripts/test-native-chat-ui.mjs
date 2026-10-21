// Isolated component test: synthetic identity, intercepted APIs, no real sign-in.
// Run with: node scripts/test-native-chat-ui.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'

const root = new URL('../', import.meta.url).pathname
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {BrowserRouter,Routes,Route} from 'react-router-dom'; import {NativeChatPage} from './src/ui/views/chat/NativeChatPage'; import {FloatingSocialDock} from './src/ui/components/FloatingSocialDock'; import {EventPosterTools} from './src/ui/components/EventPosterTools'; import {OrganizationLinksEditor} from './src/ui/components/OrganizationLinksEditor'; import {normalizeOrganizationLinks} from '../shared/organizationLinks'; import {setGroupSite} from './src/config/timebankCommunity'; setGroupSite({id:'baltimore-medtech',organization_id:'org-life',home_org_slug:'lifetech',slug:'lifetech',name:'LifeTech',features:['chat'],profile:'lifetech',canonical_path_prefix:'',feature_config:{whatsappUrl:'https://chat.whatsapp.com/WrongTenantCopy'}}); function PosterFixture(){const [org,setOrg]=React.useState(null);React.useEffect(()=>{fetch('/api/org/api/network/orgs/public/org-life').then(r=>r.json()).then(setOrg)},[]);return <EventPosterTools inline slug='demo' title='Demo' organizationSlug='lifetech' organizationLinks={org?.links}/>}; function LinksFixture(){const [links,setLinks]=React.useState([]);const [status,setStatus]=React.useState('');React.useEffect(()=>{fetch('/api/org/api/network/orgs/public/org-life').then(r=>r.json()).then(org=>setLinks(org.links))},[]);return <><OrganizationLinksEditor links={links} onChange={setLinks}/><button onClick={async()=>{await fetch('/api/org/api/network/orgs/org-life',{method:'PATCH',body:JSON.stringify({links:normalizeOrganizationLinks(links)})});setStatus('Links saved')}}>Save links</button><p role='status'>{status}</p></>}; createRoot(document.getElementById('root')).render(<BrowserRouter><FloatingSocialDock/><Routes><Route path="/org-links-fixture" element={<LinksFixture/>}/><Route path="/poster-fixture" element={<PosterFixture/>}/><Route path="/chat" element={<NativeChatPage/>}/><Route path="/chat/:roomId" element={<NativeChatPage/>}/></Routes></BrowserRouter>);`, resolveDir: root, loader: 'tsx' },
  bundle: true, write: false, outfile: 'app.js', format: 'iife', jsx: 'automatic', define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/' }) },
  plugins: [{ name: 'local-component-identity', setup(b) {
    b.onResolve({ filter: /(?:^|\/)AppProviders$/ }, () => ({ path: 'identity', namespace: 'test-fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'test-fixture' }, () => ({ contents: `export function useAuth(){return {token:'local-component-fixture',user:{id:'me',displayName:'Local Member'}}}` }))
  } }],
})
const css = await readFile(`${root}public/css/master.css`, 'utf8') + '\n' + await readFile(`${root}src/index.css`, 'utf8')
const server = createServer((req,res) => {
  res.setHeader('content-type', req.url === '/app.js' ? 'application/javascript' : req.url === '/style.css' ? 'text/css' : 'text/html')
  res.end(req.url === '/app.js' ? bundle.outputFiles[0].contents : req.url === '/style.css' ? css : '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>')
})
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/google-chrome', args: ['--no-sandbox'] })
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 850 }, permissions: ['clipboard-read','clipboard-write'], serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors = [], sends = [], joins = [], accepted = new Map()
  const conversation = { id: 'community-room', kind: 'org_room', org_id: 'org-life', title: 'LifeTech', updated_at: '2026-10-21T12:00:00Z', members: [{user_id:'me',user_name:'Local Member',state:'active'}] }
  page.on('pageerror', error => errors.push(error.message))
  let activeSocket, history = [], organizationLinks = [{id:'whatsapp',type:'whatsapp',url:'https://chat.whatsapp.com/Group123'},{id:'calendar',type:'luma',url:'https://luma.com/lifetech'},{id:'tickets',type:'eventbrite',url:'https://www.eventbrite.com/o/lifetech'}]
  await page.routeWebSocket('**/*', socket => { activeSocket = socket })
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== origin) return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const reply = body => route.fulfill({json:body})
    if (url.pathname === '/api/org/api/network/orgs/public/org-life') return reply({id:'org-life',name:'LifeTech',slug:'lifetech',links:organizationLinks})
    if (url.pathname === '/api/org/api/network/orgs/org-life' && request.method()==='PATCH') { organizationLinks=request.postDataJSON().links; return reply({links:organizationLinks}) }
    if (url.pathname.endsWith('/poster-images')) return reply([])
    if (url.pathname.endsWith('/flyer.svg')) return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 850 1100"><text x="20" y="30">Demo poster</text></svg>'})
    if (url.pathname === '/api/org/api/network/orgs') return reply([{id:'org-life',name:'LifeTech',slug:'lifetech'}])
    if (url.pathname === '/api/org/api/network/users') return reply([])
    if (url.pathname.endsWith('/org-room')) { joins.push(request.postDataJSON()); return reply({conversation}) }
    if (url.pathname.endsWith('/conversations')) return reply({conversations:[conversation,{...conversation,id:'another-room',title:'Garden Club'}]})
    if (url.pathname.endsWith('/messages') && request.method() === 'POST') {
      const data=request.postDataJSON(); sends.push(data)
      if (!accepted.has(data.client_message_id)) accepted.set(data.client_message_id,{id:'message-1',conversation_id:conversation.id,sender_user_id:'me',sender_name:'Local Member',body:data.body,client_message_id:data.client_message_id,created_at:'2026-10-21T12:00:00Z',sequence:1})
      if(sends.length===1) return route.fulfill({status:503,json:{detail:'Connection interrupted'}})
      return reply({message:accepted.get(data.client_message_id)})
    }
    if (url.pathname.endsWith('/messages')) return reply({messages:history,latest_sequence:history.length})
    if (url.pathname.endsWith('/sync')) return reply({messages:[],latest_sequence:history.length})
    if (url.pathname.endsWith('/presence')) return reply({presence:[]})
    if (url.pathname.endsWith('/read')) return reply({ok:true})
    throw new Error(`Unmocked fixture request: ${request.method()} ${url.pathname}`)
  })
  await page.goto(`${origin}/chat?start=group&org=lifetech`)
  await page.getByRole('heading',{name:'LifeTech',exact:true}).waitFor()
  assert.deepEqual(joins[0],{organization_slug:'lifetech'})
  assert.equal(new URL(page.url()).pathname,'/chat/community-room')
  assert.ok(await page.getByRole('searchbox').evaluate(node=>node.getBoundingClientRect().height) <= 48)
  await page.getByRole('searchbox').fill('LifeTech')
  assert.equal(await page.getByRole('button',{name:'Garden Club'}).count(),0)
  await page.getByRole('link',{name:'LifeTech',exact:true}).waitFor()
  await page.getByRole('searchbox').fill('')
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Hello community')
  await page.getByRole('button',{name:'Send',exact:true}).click()
  await page.getByRole('button',{name:'Retry',exact:true}).click()
  await page.getByRole('button',{name:'Retry',exact:true}).waitFor({state:'detached'})
  assert.equal(sends.length,2)
  assert.equal(sends[0].client_message_id,sends[1].client_message_id)
  assert.equal(accepted.size,1)
  assert.equal(await page.locator('.portal-chat-message').count(),1)
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Composing text')
  await page.getByRole('textbox',{name:'Message',exact:true}).evaluate(node=>node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})))
  assert.equal(sends.length,2)
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('')
  await page.getByRole('button',{name:'Share chat link'}).click()
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),`${origin}/chat?start=org&org=lifetech`)
  await mkdir(`${root}test-results/native-chat-ui`,{recursive:true})
  await page.screenshot({path:`${root}test-results/native-chat-ui/desktop.png`})
  history = Array.from({length:80},(_,i)=>({id:`history-${i}`,conversation_id:conversation.id,sender_user_id:'other',sender_name:'Community Member',body:`Earlier community message ${i}`,created_at:new Date(Date.UTC(2026,9,21,12,i)).toISOString(),sequence:i+1}))
  await page.setViewportSize({width:390,height:844})
  await page.goto(`${origin}/chat?start=org&org=lifetech`)
  await page.getByRole('heading',{name:'LifeTech',exact:true}).waitFor()
  await page.getByRole('button',{name:'Expand conversations'}).click()
  await page.getByRole('searchbox').fill('LifeTech')
  await page.getByRole('link',{name:'LifeTech',exact:true}).click()
  await page.getByRole('button',{name:'Expand conversations'}).waitFor()
  await page.getByText('Earlier community message 79',{exact:true}).waitFor()
  await page.getByText('Connected',{exact:true}).waitFor()
  await page.locator('.portal-chat-timeline').evaluate(node=>{node.scrollTop=0;node.dispatchEvent(new Event('scroll'))})
  await page.waitForTimeout(100)
  activeSocket.send(JSON.stringify({type:'message.created',conversation_id:conversation.id,message:{...history[79],id:'new-81',body:'New community message',sequence:81},sequence:81}))
  await page.getByText('New community message',{exact:true}).waitFor({timeout:5000})
  await page.getByRole('button',{name:'Jump to latest messages'}).waitFor({timeout:5000})
  assert.equal(await page.locator('.portal-chat-timeline').evaluate(node=>node.scrollTop),0)
  await page.getByRole('button',{name:'Jump to latest messages'}).click()
  await page.waitForFunction(()=>{const node=document.querySelector('.portal-chat-timeline');return node.scrollHeight-node.scrollTop-node.clientHeight<80})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({path:`${root}test-results/native-chat-ui/mobile.png`})
  await page.goto(`${origin}/poster-fixture`)
  await page.waitForFunction(()=>document.querySelector('a[title="WhatsApp group"]')?.getAttribute('href')==='https://chat.whatsapp.com/Group123')
  const posterLink = page.getByRole('combobox',{name:'Poster link',exact:true})
  const flyer = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/flyer.svg') && new URL(request.url()).searchParams.get('link')==='org-link:whatsapp')
  await posterLink.selectOption('org-link:whatsapp')
  await flyer
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('orgportal:poster:v1:demo')).link==='org-link:whatsapp')
  assert.ok(!(await page.evaluate(()=>localStorage.getItem('orgportal:poster:v1:demo'))).includes('Group123'))
  organizationLinks=organizationLinks.map(link=>link.type==='whatsapp'?{...link,url:'https://chat.whatsapp.com/RotatedGroup'}:link)
  await page.reload()
  await page.waitForFunction(()=>document.querySelector('a[title="WhatsApp group"]')?.getAttribute('href')==='https://chat.whatsapp.com/RotatedGroup')
  await page.waitForFunction(()=>document.querySelector('select[aria-label="Poster link"]')?.value==='org-link:whatsapp')
  await posterLink.selectOption('org-link:calendar')
  await posterLink.selectOption('org-link:tickets')
  organizationLinks=[]
  await page.reload()
  await page.waitForFunction(()=>document.querySelector('select[aria-label="Poster link"]')?.value==='portal' && !document.querySelector('select[aria-label="Poster link"] option[value="org-link:whatsapp"]'))
  assert.equal(await page.getByRole('link',{name:'WhatsApp group'}).count(),0)
  organizationLinks=[{id:'starter',type:'website',url:'https://example.org/'}]
  await page.goto(`${origin}/org-links-fixture`)
  await page.getByRole('combobox',{name:'Link 1 type',exact:true}).waitFor()
  await page.getByRole('button',{name:'Remove link 1',exact:true}).click()
  for(const [index,type,label,url] of [[1,'luma','Meetups','https://luma.com/meetups'],[2,'eventbrite','Tickets','https://www.eventbrite.com/o/community'],[3,'luma','Workshops','https://luma.com/workshops']]) {
    await page.getByRole('button',{name:'Add organization link',exact:true}).click()
    await page.getByRole('combobox',{name:`Link ${index} type`,exact:true}).selectOption(type)
    await page.getByRole('textbox',{name:`Link ${index} label`,exact:true}).fill(label)
    await page.getByRole('textbox',{name:`Link ${index} URL`,exact:true}).fill(url)
  }
  await page.getByRole('button',{name:'Save links',exact:true}).click()
  await page.getByText('Links saved',{exact:true}).waitFor()
  assert.deepEqual(organizationLinks.map(link=>link.type),['luma','eventbrite','luma'])
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.goto(`${origin}/poster-fixture`)
  await page.getByRole('option',{name:'Organization: Workshops',exact:true}).waitFor({state:'attached'})
  await page.getByRole('link',{name:'Tickets',exact:true}).waitFor()
  assert.deepEqual(errors,[])
  console.log('Native chat UI passed: legacy group links, group discovery, search, idempotent retry, sharing, IME input, history scrolling, mobile navigation, and typed Organization Links, Luma/Eventbrite editor round trips, and shared-link rotation/removal.')
  await context.close()
} finally {
  await browser.close()
  await new Promise(resolve=>server.close(resolve))
}
