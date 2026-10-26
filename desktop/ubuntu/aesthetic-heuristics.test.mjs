import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
import {unionArea,compositionPoint,audit,collectAestheticSnapshot} from './aesthetic-heuristics.mjs'
const base=()=>({frame:{x:0,y:20,width:100,height:100},ink:[],blocks:[],spacings:[],paragraphs:[],contrast:[],contrastSkipped:[],focal:null,overflow:false,brokenImages:[]})
test('overlapping rectangles count occupied area only once',()=>{
 assert.equal(unionArea([{x:0,y:0,width:10,height:10},{x:5,y:0,width:10,height:10}]),150)
 assert.equal(unionArea([{x:0,y:0,width:10,height:10},{x:2,y:2,width:3,height:3}]),100)
 assert.equal(unionArea([]),0)
})
test('thirds use the content coordinate frame, with a separate golden-section measurement',()=>{
 const result=compositionPoint({x:100,y:220},{x:0,y:20,width:300,height:300})
 assert.equal(result.thirdsIntersectionDistance,0)
 assert.ok(result.goldenIntersectionDistance>0)
 assert.equal(compositionPoint(null,{width:300,height:300}),null)
})
test('density clips offscreen content and removes overlap',()=>{
 const s=base();s.ink=[{x:-50,y:20,width:100,height:100},{x:0,y:20,width:50,height:100}]
 const result=audit(s)
 assert.equal(result.metrics.whitespaceFraction,.5)
 assert.equal(result.metrics.leftAreaFraction,1)
 assert.equal(result.metrics.rightAreaFraction,0)
})
test('composition is advisory even when a focal point is nowhere near thirds',()=>{
 const s=base();s.focal={x:50,y:70}
 const result=audit(s)
 assert.equal(result.metrics.composition.centerDistance,0)
 assert.equal(result.errors,0)
 assert.equal(result.findings.some(f=>f.id==='composition'),false)
 assert.equal(result.findings.find(f=>f.id==='whitespace').kind,'project heuristic')
})
test('concrete failures are not hidden by aesthetic metrics; project thresholds are configurable',()=>{
 const s=base();s.overflow=true;s.contrast=[{text:'Example',ratio:2,required:4.5}]
 assert.equal(audit(s,{whitespaceMax:1}).errors,2)
 assert.equal(audit(s,{whitespaceMax:1}).review,0)
})
test('reading flags are advisories, not a declaration of WCAG failure',()=>{
 const s=base();s.paragraphs=[{text:'Prose',maxLineCharacters:90,leading:1.2}]
 const result=audit(s,{whitespaceMax:1})
 assert.equal(result.errors,0)
 assert.equal(result.review,2)
 assert.ok(result.findings.every(f=>f.kind==='reading advisory'))
})
test('browser sampler resolves translucent backgrounds and skips gradients instead of guessing',async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true})
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}})
  await page.setContent('<style>body{margin:0;background:white;color:black}header{height:60px}main{background:rgba(0,0,0,.5)}p{margin:0;color:rgb(0,0,0);line-height:1.5}.gradient{background:linear-gradient(red,blue)}</style><header></header><main><h1>Heading</h1><p>Sample contrast</p><p class="gradient">Unknown background</p><p style="color:#777;background:#888">Low contrast</p><div style="opacity:0"><p>Invisible text</p></div></main>')
  const s=await page.evaluate(collectAestheticSnapshot)
  assert.ok(s.contrast.find(v=>v.text==='Sample contrast').ratio>5)
  assert.ok(s.contrast.find(v=>v.text==='Sample contrast').ratio<6)
  assert.ok(s.contrastSkipped.includes('Unknown background'))
  assert.ok(audit(s).findings.some(f=>f.id==='contrast'&&f.measure.text==='Low contrast'))
  assert.equal(s.contrast.some(f=>f.text==='Invisible text'),false)
  assert.equal(s.frame.y,0) // Generic headers are not treated as persistent app chrome.
  assert.equal(audit(s).metrics.composition!==null,true)
  await page.setContent('<main><p>No focal heading</p></main>')
  assert.equal(audit(await page.evaluate(collectAestheticSnapshot)).metrics.composition,null)
 }finally{await browser.close()}
})

test('invalid or inverted project thresholds are rejected',()=>{
 assert.throws(()=>audit(base(),{alignmentMin:1.1}),/Invalid/)
 assert.throws(()=>audit(base(),{inventedThreshold:1}),/Invalid/)
 assert.throws(()=>audit(base(),{whitespaceMin:.9,whitespaceMax:.1}),/minimum exceeds/)
})
