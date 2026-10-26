const { get } = require('node:http')
const test = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { browserAuth } = require('./browser-auth.cjs')

test('browser callback rejects wrong state, host, request and duplicates before PKCE redemption', async () => {
  let start, redemptions = 0, completed
  const done = new Promise(resolve => { completed = resolve })
  const session = { async fetch(url, options) {
    if (url.includes('/start?')) {
      start = new URL(url)
      assert.equal(start.searchParams.has('prompt'), false, 'Reuse the normal browser session instead of forcing another login')
      return Response.json({request:'r'.repeat(54),authorization_url:'https://id.example/auth/sso/authorize?request='+'r'.repeat(54)})
    }
    redemptions++
    assert.equal(options.method, 'POST')
    const proof = JSON.parse(options.body)
    assert.equal(createHash('sha256').update(proof.code_verifier).digest('base64url'), start.searchParams.get('code_challenge'))
    assert.equal(proof.code, 'c'.repeat(54))
    return Response.json({next:'/auth/callback?next=%2Forg-events'})
  } }
  const handle = await browserAuth({session,portalOrigin:'https://portal.example',issuer:'https://id.example',openExternal:async()=>{},onComplete:async url=>completed(url),onError:error=>assert.fail(error.message)})
  try {
    const callback = new URL(start.searchParams.get('redirect_uri'))
    const params = new URLSearchParams({state:start.searchParams.get('state'),request:'r'.repeat(54),code:'c'.repeat(54)})
    for (const modified of [new URLSearchParams({...Object.fromEntries(params),state:'x'.repeat(43)}),new URLSearchParams({...Object.fromEntries(params),request:'x'.repeat(54)}),new URLSearchParams(params.toString()+'&code=duplicate'),new URLSearchParams({...Object.fromEntries(params),state:'é'.repeat(43)})]) {
      assert.equal((await fetch(callback+'?'+modified)).status,400)
    }
    const wrongHost = await new Promise((resolve,reject)=>get(callback+'?'+params,{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode)}).on('error',reject))
    assert.equal(wrongHost,400)
    assert.equal(redemptions,0)
    assert.equal((await fetch(callback+'?'+params)).status,200)
    assert.equal(await done,'https://portal.example/auth/callback?next=%2Forg-events')
    assert.equal(redemptions,1)
  } finally { handle.cancel() }
})
test('opening the browser unsuccessfully closes the loopback listener', async () => {
  let callback
  await assert.rejects(browserAuth({portalOrigin:'https://portal.example',issuer:'https://id.example',session:{async fetch(url){callback=new URL(url).searchParams.get('redirect_uri');return Response.json({request:'r'.repeat(54),authorization_url:'https://id.example/auth/sso/authorize?request='+'r'.repeat(54)})}},openExternal:async()=>{throw Error('Browser unavailable')},onComplete:async()=>{},onError:()=>{}}),/Browser unavailable/)
  await assert.rejects(fetch(callback))
})
