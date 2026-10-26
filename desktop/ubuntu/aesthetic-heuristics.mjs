export const sources = {
  composition: {url:'https://fanglue.github.io/papers/AsiaPoster.pdf', title:'Hoh, Zhang & Dodgson (2023), Rule-of-Thirds or Centered?', limitation:'Photo composition research; not a validated interface quality predictor.'},
  interface: {url:'https://doi.org/10.1016/S0020-0255(02)00404-8', title:'Ngo, Teo & Byrne (2003), Modelling interface aesthetics', limitation:'Inspires balance/density measurements; our DOM proxies are not a replication of its model.'},
  contrast: {url:'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html', title:'WCAG 2.2 SC 1.4.3, Contrast (Minimum)'},
  reading: {url:'https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html', title:'WCAG SC 1.4.8, Visual Presentation (AAA)', limitation:'These measurements are reading advisories, not a test of the required user-adjustment mechanism.'},
}
export const defaults = {compositionTolerance:0.05, whitespaceMin:0.20, whitespaceMax:0.80, alignmentMin:0.70, spacingScaleMin:0.80, maxLineCharacters:80, minParagraphLeading:1.5}
const round = value => Math.round(value * 1000) / 1000
export function unionArea(rectangles) {
  const xs = [...new Set(rectangles.flatMap(r=>[r.x,r.x+r.width]))].sort((a,b)=>a-b)
  let area=0
  for(let i=1;i<xs.length;i++){
    const intervals=rectangles.filter(r=>r.x<xs[i]&&r.x+r.width>xs[i-1]).map(r=>[r.y,r.y+r.height]).sort((a,b)=>a[0]-b[0])
    let covered=0,end=-Infinity
    for(const [a,b] of intervals){covered+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b)}
    area+=(xs[i]-xs[i-1])*covered
  }
  return area
}
export function compositionPoint(point, frame) {
  if(!point||!frame.width||!frame.height)return null
  const x=(point.x-frame.x)/frame.width,y=(point.y-frame.y)/frame.height
  const nearest = guides => Math.min(...guides.flatMap(gx=>guides.map(gy=>Math.hypot(x-gx,y-gy))))
  return {x:round(x),y:round(y),thirdsIntersectionDistance:round(nearest([1/3,2/3])),goldenIntersectionDistance:round(nearest([0.381966,0.618034])),centerDistance:round(Math.hypot(x-.5,y-.5))}
}
export function audit(snapshot, configuration={}) {
  const config={...defaults,...configuration}, frame=snapshot.frame
  for(const [key,value] of Object.entries(configuration)){
    if(!(key in defaults)||!Number.isFinite(value)||value<0||((key.endsWith('Min')||key.endsWith('Max')||key==='compositionTolerance')&&value>1))throw Error(`Invalid aesthetic configuration: ${key}`)
  }
  if(config.whitespaceMin>config.whitespaceMax)throw Error('Whitespace minimum exceeds maximum')
  const clip=r=>({x:Math.max(frame.x,r.x),y:Math.max(frame.y,r.y),width:Math.max(0,Math.min(frame.x+frame.width,r.x+r.width)-Math.max(frame.x,r.x)),height:Math.max(0,Math.min(frame.y+frame.height,r.y+r.height)-Math.max(frame.y,r.y))})
  const rects=snapshot.ink.map(clip).filter(r=>r.width>0&&r.height>0)
  const occupied=unionArea(rects), area=frame.width*frame.height
  const whitespace=area ? 1-occupied/area : null
  const left=unionArea(rects.map(r=>({...r,width:Math.max(0,Math.min(r.x+r.width,frame.x+frame.width/2)-r.x)})).filter(r=>r.width>0))
  const right=occupied-left
  const alignment=snapshot.blocks.length ? snapshot.blocks.filter(r=>snapshot.blocks.some(other=>other!==r&&Math.abs(other.x-r.x)<=4)).length/snapshot.blocks.length : null
  const spaces=snapshot.spacings.filter(v=>v>=4)
  const spacing=spaces.length ? spaces.filter(v=>Math.abs(v/4-Math.round(v/4))*4<=1).length/spaces.length : null
  const focal=compositionPoint(snapshot.focal,frame)
  const findings=[]
  const add=(id,severity,measure,message,source,kind)=>findings.push({id,severity,measure,message,source,kind})
  if(snapshot.overflow)add('overflow','error',snapshot.overflow,'Document is wider than the viewport.',null,'geometry')
  if(snapshot.brokenImages?.length)add('broken-images','error',snapshot.brokenImages,'Visible images failed to load.',null,'geometry')
  for(const item of snapshot.contrast){
    if(item.ratio<item.required)add('contrast','error',item,`Sampled text contrast ${item.ratio.toFixed(2)}:1 is below ${item.required}:1.`, 'contrast','standard-based sample')
  }
  if(whitespace!==null&&(whitespace<config.whitespaceMin||whitespace>config.whitespaceMax))add('whitespace','review',round(whitespace),`DOM box whitespace proxy is outside the project review range ${config.whitespaceMin*100}–${config.whitespaceMax*100}%.`, 'interface','project heuristic')
  if(alignment!==null&&alignment<config.alignmentMin)add('alignment','review',round(alignment),`Fewer than ${config.alignmentMin*100}% of content blocks share a left edge within 4px. Intentional staggered layouts may be valid.`,null,'project heuristic')
  if(spacing!==null&&spacing<config.spacingScaleMin)add('spacing','review',round(spacing),`Fewer than ${config.spacingScaleMin*100}% of measured gaps/padding follow a 4px scale (±1px).`,null,'project heuristic')
  for(const p of snapshot.paragraphs){
    if(p.maxLineCharacters>config.maxLineCharacters)add('line-length','review',p,`A sampled prose line exceeds ${config.maxLineCharacters} characters.`, 'reading','reading advisory')
    if(p.leading!==null&&p.leading<config.minParagraphLeading)add('leading','review',p,`Sampled prose leading is below ${config.minParagraphLeading*100}% of font size.`, 'reading','reading advisory')
  }
  return {scope:'Visible content viewport, below the persistent header. DOM geometry is not pixel saliency or human aesthetic judgment.',config,sources,metrics:{whitespaceFraction:whitespace===null?null:round(whitespace),leftAreaFraction:occupied?round(left/occupied):null,rightAreaFraction:occupied?round(right/occupied):null,alignmentFraction:alignment===null?null:round(alignment),spacingScaleFraction:spacing===null?null:round(spacing),composition:focal,compositionNearThirds:focal?focal.thirdsIntersectionDistance<=config.compositionTolerance:null,compositionNearGolden:focal?focal.goldenIntersectionDistance<=config.compositionTolerance:null,contrastSamples:snapshot.contrast.length,contrastSkipped:snapshot.contrastSkipped},findings,errors:findings.filter(f=>f.severity==='error').length,review:findings.filter(f=>f.severity==='review').length}
}

// Self-contained so Playwright can execute it inside the isolated rendered page.
export function collectAestheticSnapshot() {
  const width=innerWidth,height=innerHeight
  const header=document.querySelector('.site-header, .portal-header')
  const top=Math.min(height,Math.max(0,header?.getBoundingClientRect().bottom||0))
  const frame={x:0,y:top,width:document.documentElement.clientWidth,height:height-top}
  const visible=e=>{
    const r=e.getBoundingClientRect(),s=getComputedStyle(e)
    if(!(r.width>0&&r.height>0&&r.bottom>top&&r.top<height&&r.right>0&&r.left<width&&s.display!=='none'&&s.visibility!=='hidden'&&!!e.getClientRects().length))return false
    for(let p=e;p;p=p.parentElement)if(getComputedStyle(p).opacity==='0')return false
    return true
  }
  const box=r=>({x:r.x,y:r.y,width:r.width,height:r.height})
  const label=e=>(e.innerText||e.getAttribute('aria-label')||e.tagName).trim().replace(/\s+/g,' ').slice(0,100)
  const main=document.querySelector('main')||document.body
  const candidates=[...main.querySelectorAll('h1,h2,h3,p,a,button,label,summary,img,input,select')].filter(visible)
  const ink=[]
  for(const e of candidates){
    if(e.matches('img,input,select,button'))ink.push(box(e.getBoundingClientRect()))
    else for(const node of e.childNodes)if(node.nodeType===Node.TEXT_NODE&&node.textContent.trim()){
      const range=document.createRange();range.selectNodeContents(node);for(const r of range.getClientRects())ink.push(box(r))
    }
  }
  const h1=main.querySelector('h1')
  const focal=h1&&visible(h1)?box(h1.getBoundingClientRect()):null
  // Heading box center is a reproducible focal proxy, not an eye-tracking estimate.
  const blocks=[...main.querySelectorAll('h1,h2,h3,p,article')].filter(visible).map(e=>box(e.getBoundingClientRect()))
  const spacings=[...main.querySelectorAll('section,article,nav,[class*="grid"],[class*="card"]')].filter(visible).flatMap(e=>{const s=getComputedStyle(e);return ['rowGap','columnGap','paddingTop','paddingRight','paddingBottom','paddingLeft'].map(k=>parseFloat(s[k])).filter(Number.isFinite)})
  const paragraphs=[...main.querySelectorAll('p')].filter(e=>visible(e)&&e.textContent.trim().length>=80).slice(0,12).map(e=>{
    const lines=new Map(),walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT)
    let node,count=0
    while((node=walker.nextNode())&&count<1200)for(let i=0;i<node.length&&count<1200;i++,count++){
      const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);const r=range.getBoundingClientRect()
      if(r.width&&r.height&&r.top<height&&r.bottom>top){const y=Math.round(r.top);lines.set(y,(lines.get(y)||0)+1)}
    }
    const style=getComputedStyle(e),leading=parseFloat(style.lineHeight)/parseFloat(style.fontSize)
    return {text:label(e),maxLineCharacters:Math.max(0,...lines.values()),leading:Number.isFinite(leading)?leading:null}
  })
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d',{willReadFrequently:true})
  const rgba=color=>{context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v)}
  const composite=(a,b)=>a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3])).concat(1)
  const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0)
  const contrast=[],contrastSkipped=[]
  for(const e of candidates.filter(e=>!e.matches('img,input,select')&&[...e.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())).slice(0,150)){
    const chain=[];let skip=false
    for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);chain.unshift(s);if(s.backgroundImage!=='none'||Number(s.opacity)<1||s.mixBlendMode!=='normal'||s.filter!=='none')skip=true}
    if(skip||e.closest('button:disabled,[aria-disabled="true"]')){contrastSkipped.push(label(e));continue}
    let background=[255,255,255,1]
    for(const style of chain)background=composite(rgba(style.backgroundColor),background)
    const s=getComputedStyle(e),foreground=composite(rgba(s.color),background),a=luminance(foreground),b=luminance(background)
    const large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.6667&&parseInt(s.fontWeight)>=700)
    contrast.push({text:label(e),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),required:large?3:4.5})
  }
  return {frame,ink,blocks,spacings,paragraphs,contrast,contrastSkipped, focal:focal?{x:focal.x+focal.width/2,y:focal.y+focal.height/2,label:label(h1)}:null,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,brokenImages:[...document.images].filter(e=>visible(e)&&e.complete&&!e.naturalWidth).map(e=>e.getAttribute('src'))}
}
