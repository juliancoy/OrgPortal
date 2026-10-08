// Isolated browser fixtures: no real login, production APIs or persistent accounts.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from '@playwright/test'

const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {MemoryRouter} from 'react-router-dom';
      import {EventCompanyVotes} from './src/ui/components/EventCompanyVotes';
      const root=createRoot(document.getElementById('root'));
      window.renderVotes=(eventId,token)=>{window.fixtureToken=token;
        root.render(<MemoryRouter initialEntries={['/events/amplify']}><EventCompanyVotes eventId={eventId}/></MemoryRouter>)};
      window.renderVotes('pitch',null);`,
    resolveDir: new URL('../', import.meta.url).pathname, loader: 'tsx',
  },
  bundle: true, write: false, outdir: '/tmp/company-votes-fixture', jsx: 'automatic',
  plugins: [{ name: 'fixture-auth', setup(builder) {
    builder.onResolve({ filter: /app\/AppProviders$/ }, () => ({ path: 'auth', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const useAuth=()=>({token:window.fixtureToken})', loader: 'js' }))
  } }],
})
const script = bundle.outputFiles.find(file => file.path.endsWith('.js')).text
const css = bundle.outputFiles.find(file => file.path.endsWith('.css')).text
const server = createServer((req, res) => {
  if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(script); return }
  res.setHeader('Content-Type', 'text/html')
  res.end(`<html><head><style>:root{--border:#ddd;--panel:#fff;--accent:#155e59;--muted:#555}body{font-family:system-ui;max-width:800px;margin:24px}button{font:inherit}a{color:#155e59}${css}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const votes = new Map()
  let closed = false, fail = false, writes = 0, delayWrite = false, releaseWrite
  const companies = ['BlueHealer','Salynt','Liquet Medical Inc.','Rubitection Inc.','WearableDose']
    .map((name, i) => ({id:`c${i}`,name,slug:`company-${i}`,image_url:i===4?null:`${origin}/company-image-${i}.svg`,description:`${name} researched organization description.`,upvotes:0,downvotes:0,score:0}))
  const summary = () => ({ available:true,closed,closes_at:'2099-10-16T00:00:00Z',companies:companies.map(company => {
    const values=[...votes].filter(([key])=>key.startsWith(`pitch:${company.id}:`)).map(([,v])=>v)
    return {...company,upvotes:values.filter(v=>v===1).length,downvotes:values.filter(v=>v===-1).length,score:values.reduce((a,b)=>a+b,0)}
  }) })
  await page.route('**/*', async route => {
    const request=route.request(),url=new URL(request.url())
    assert.equal(url.origin,origin,'Fixtures must never contact a remote service')
    if (url.pathname.startsWith('/company-image-')) { await route.fulfill(url.pathname.includes('-3.') ? {status:404,body:''} : {contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="88"><rect width="180" height="88" fill="teal"/></svg>'}); return }
    if (!url.pathname.includes('/company-votes')) { await route.continue(); return }
    const user=request.headers().authorization || ''
    const companyId=url.pathname.split('/').at(-1)
    if (request.method()==='PUT') {
      writes += 1
      if (delayWrite) await new Promise(resolve => { releaseWrite=resolve })
      if (fail) { await route.fulfill({status:503,json:{message:'Temporary vote failure'}}); return }
      assert.ok(user,'Vote requires an authenticated fixture account')
      const value=request.postDataJSON().value,key=`pitch:${companyId}:${user}`
      if (value===0) votes.delete(key); else votes.set(key,value)
      await route.fulfill({json:{...summary(),company_id:companyId,my_vote:value}})
    } else if (url.pathname.endsWith('/public')) {
      await route.fulfill({json:url.pathname.includes('/ordinary/') ? {available:false,closed:true,closes_at:null,companies:[]} : summary()})
    } else {
      await route.fulfill({json:{votes:Object.fromEntries([...votes].filter(([key])=>key.endsWith(`:${user}`)).map(([key,value])=>[key.split(':')[1],value]))}})
    }
  })
  const render = async (token, eventId='pitch') => page.evaluate(({token,eventId})=>window.renderVotes(eventId,token),{token,eventId})
  const up = () => page.getByRole('button',{name:'Upvote BlueHealer',exact:true})
  const down = () => page.getByRole('button',{name:'Downvote BlueHealer',exact:true})
  const pressed = async (locator,value) => { await locator.waitFor(); await page.waitForFunction(({name,value})=>document.querySelector(`button[aria-label="${name}"]`)?.getAttribute('aria-pressed')===value,{name:await locator.getAttribute('aria-label'),value:String(value)}) }
  await page.goto(origin)
  await page.getByRole('link',{name:'Sign in to vote',exact:true}).waitFor()
  assert.equal(await page.locator('.company-vote-row').count(),5)
  assert.equal(await page.locator('.company-vote-description').first().textContent(),companies[0].description)
  assert.equal(await page.locator('.company-vote-row').first().getByRole('link').getAttribute('href'),'/orgs/company-0')
  await page.waitForFunction(()=>{const image=document.querySelector('.company-vote-image img');return image?.complete && image.naturalWidth>0})
  await page.locator('.company-vote-row').nth(3).scrollIntoViewIfNeeded()
  await page.waitForFunction(()=>document.querySelectorAll('.company-vote-image')[3].textContent==='R')
  assert.equal(await page.locator('.company-vote-image').nth(4).textContent(),'W')
  assert.match(await page.locator('.company-voting').innerText(), /Voting closes Oct 15, 8:00 PM EDT/)
  assert.equal(await up().isDisabled(),true)
  assert.equal(writes,0)
  await render('alice')
  await up().click(); await pressed(up(),true)
  assert.equal(votes.get('pitch:c0:Bearer alice'),1)
  await down().click(); await pressed(down(),true)
  assert.equal(votes.get('pitch:c0:Bearer alice'),-1)
  await down().click(); await pressed(down(),false)
  assert.equal(votes.has('pitch:c0:Bearer alice'),false)
  await up().click(); await pressed(up(),true)
  await page.getByRole('button',{name:'Refresh totals',exact:true}).click(); await pressed(up(),true)
  fail=true
  await down().click()
  await page.getByRole('status').filter({hasText:'Temporary vote failure'}).waitFor()
  assert.equal(await up().isDisabled(),true)
  assert.equal(votes.get('pitch:c0:Bearer alice'),1)
  fail=false
  await page.getByRole('button',{name:'Reload votes',exact:true}).click(); await pressed(up(),true)
  delayWrite=true
  await down().click()
  await page.waitForFunction(()=>document.body.textContent.includes('Saving…'))
  await render('bob')
  await pressed(up(),false)
  releaseWrite(); delayWrite=false
  await page.waitForTimeout(100)
  assert.equal(await up().getAttribute('aria-pressed'),'false','Old account response must not change the new account UI')
  closed=true
  await render('alice')
  const clear=page.getByRole('button',{name:'Clear downvote for BlueHealer',exact:true})
  await clear.waitFor()
  assert.equal(await up().isDisabled(),true)
  await clear.click(); await down().waitFor()
  assert.equal(votes.has('pitch:c0:Bearer alice'),false)
  assert.equal(await down().isDisabled(),true)
  await page.setViewportSize({width:390,height:844})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile page must not overflow')
  await render('alice','ordinary')
  await page.waitForFunction(()=>!document.querySelector('.company-voting'))
  assert.deepEqual(errors,[])
  console.log('PASS: five company cards; sign-in gating; upvote/downvote/clear; persisted reload; failed-save recovery; account-switch race; closed ballot clearing; ordinary events hidden; mobile layout.')
} finally {
  if (browser) await browser.close()
  await new Promise(resolve=>server.close(resolve))
}
