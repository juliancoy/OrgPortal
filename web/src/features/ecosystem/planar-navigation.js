/** Shared 2D EcoMap controls. Only the focused canvas consumes navigation keys. */
export function bindPlanarNavigation(canvas,{zoom,pan,speed=()=>1,onNavigate=()=>{}},signal){
 const keys=new Set(),navigationKeys=new Set(['KeyW','KeyS','KeyA','KeyD','KeyE','KeyQ'])
 let frame=0,last=0,boosted=false,slowed=false
 const stop=()=>{boosted=false;slowed=false;keys.clear();cancelAnimationFrame(frame);frame=0;last=0}
 const navigate=time=>{
  frame=0;if(signal.aborted||!keys.size)return
  const dt=last?Math.min((time-last)/1000,.05):0;last=time
  const multiplier=speed()*(boosted?10:1)*(slowed?0.1:1),z=Number(keys.has('KeyW'))-Number(keys.has('KeyS'))
  if(z)zoom(Math.exp(z*1.2*multiplier*dt))
  const x=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),y=Number(keys.has('KeyQ'))-Number(keys.has('KeyE')),length=Math.hypot(x,y)||1
  pan(x/length*.7*multiplier*dt,y/length*.7*multiplier*dt)
  frame=requestAnimationFrame(navigate)
 }
 canvas.tabIndex=0
 canvas.addEventListener('keydown',event=>{
  boosted=event.shiftKey;slowed=event.ctrlKey
  if(!navigationKeys.has(event.code)||event.metaKey||event.altKey||event.isComposing)return
  event.preventDefault();onNavigate();keys.add(event.code);if(!frame)frame=requestAnimationFrame(navigate)
 },{signal})
 window.addEventListener('keyup',event=>{boosted=event.shiftKey;slowed=event.ctrlKey;keys.delete(event.code);if(!keys.size)stop()},{signal})
 canvas.addEventListener('blur',stop,{signal});window.addEventListener('blur',stop,{signal})
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()},{signal})
 signal.addEventListener('abort',stop,{once:true})
}
