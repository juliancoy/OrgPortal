// Read-only public inspector smoke test; live API failure is intentionally simulated.
import {chromium} from '@playwright/test'
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_BINARY?{executablePath:process.env.BROWSER_BINARY}:{}),args:['--no-sandbox']})
try{
 for(const host of ['lifetech.fyi','medtech.social']){
  const page=await browser.newPage({viewport:{width:1600,height:1200}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind.includes('webgl')?null:original.call(this,kind,...args)}})
  await page.route('**/api/org/**',r=>r.fulfill({status:503,body:'Saved evidence check'}))
  await page.goto(`https://${host}/ecosystem/network`)
  await page.waitForFunction(()=>document.querySelector('#network-status')?.textContent.includes('links'),{},{timeout:60000})
  const initialURL=page.url(),before=await page.locator('#network-status').textContent()
  const node=page.locator('#network-canvas svg circle').filter({has:page.locator('title',{hasText:'Code Collective ·'})}).first()
  await node.hover({force:true})
  await page.waitForFunction(()=>document.querySelector('#network-detail h2')?.textContent==='Code Collective')
  if(!await page.locator('#network-detail img').count())throw Error('Published node picture absent')
  await page.waitForFunction(()=>{const img=document.querySelector('#network-detail img');return img?.complete&&img.naturalWidth>0},{},{timeout:15000})
  if(!await page.locator('#network-detail a').count())throw Error('Node sources absent')
  const candidate=await page.locator('#network-canvas svg path[role=button]').evaluateAll(paths=>{
   for(let index=0;index<paths.length;index++)for(const f of [.2,.4,.6,.8]){
    const p=paths[index].getPointAtLength(paths[index].getTotalLength()*f),q=new DOMPoint(p.x,p.y).matrixTransform(paths[index].getScreenCTM())
    const target=document.elementFromPoint(q.x,q.y)
    if(q.y>=0&&q.y<innerHeight&&target?.tagName==='path'&&target.closest('#network-canvas'))return {index,x:q.x,y:q.y}
   }
  })
  if(!candidate)throw Error('No visible edge hover target')
  const edge=page.locator('#network-canvas svg path[role=button]').nth(candidate.index)
  await page.mouse.move(candidate.x,candidate.y);await page.waitForTimeout(150)
  if(!(await page.locator('#network-detail').textContent()).includes('Relationship preview'))throw Error('Physical edge hover did not preview')
  if(!await page.locator('#network-detail a').count())throw Error('Relationship source missing')
  if(page.url()!==initialURL || await page.locator('#network-status').textContent()!==before)throw Error('Hover changed selection or layout')
  await page.mouse.move(1500,100)
  if(!(await page.locator('#network-detail').textContent()).includes('Relationship preview'))throw Error('Preview disappears before source can be used')
  await edge.focus();if(!(await page.locator('#network-detail').textContent()).includes('Relationship preview'))throw Error('Keyboard preview unavailable')
  if(errors.length)throw Error(errors.join('\n'))
  console.log(host,'node picture/source, physical edge hover/source, stable selection, persistent inspector and keyboard preview passed')
  await page.close()
 }
}finally{await browser.close()}
