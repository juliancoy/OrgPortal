import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {bindPlanarNavigation} from './planar-navigation.js'
let frames:Map<number,FrameRequestCallback>,next:number,canvas:HTMLCanvasElement,controller:AbortController
const zoom=vi.fn(),pan=vi.fn(),onNavigate=vi.fn()
function key(target:EventTarget,type:string,code:string,modifiers={}){const event=Object.assign(new Event(type,{cancelable:true}),{code,shiftKey:false,ctrlKey:false,metaKey:false,altKey:false,isComposing:false,...modifiers});target.dispatchEvent(event);return event}
function tick(time:number){const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(time))}
beforeEach(()=>{
 frames=new Map();next=0;vi.stubGlobal('window',new EventTarget());vi.stubGlobal('document',Object.assign(new EventTarget(),{hidden:false}))
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++next,callback);return next});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id))
 canvas=new EventTarget() as HTMLCanvasElement;controller=new AbortController();zoom.mockClear();pan.mockClear();onNavigate.mockClear()
 bindPlanarNavigation(canvas,{zoom,pan,onNavigate},controller.signal)
})
afterEach(()=>{controller.abort();vi.unstubAllGlobals()})
it('uses held physical WASD/EQ keys with bounded, frame-independent motion',()=>{
 expect(key(canvas,'keydown','KeyW').defaultPrevented).toBe(true);tick(100);tick(150)
 expect(zoom).toHaveBeenLastCalledWith(Math.exp(1.2*.05));expect(onNavigate).toHaveBeenCalled()
 key(window,'keyup','KeyW');expect(frames.size).toBe(0)
 key(canvas,'keydown','KeyD');key(canvas,'keydown','KeyE');tick(200);tick(5000)
 expect(pan).toHaveBeenLastCalledWith(.7*.05/Math.sqrt(2),-.7*.05/Math.sqrt(2))
})
it('honors Shift/Control speed and ignores Meta/Alt shortcuts and composition',()=>{
 key(canvas,'keydown','KeyD',{shiftKey:true});tick(100);tick(150);expect(pan).toHaveBeenLastCalledWith(.7*10*.05,0)
 key(window,'keyup','KeyD');key(canvas,'keydown','KeyA',{ctrlKey:true});tick(200);tick(250);expect(pan).toHaveBeenLastCalledWith(-.7*.1*.05,0)
 key(window,'keyup','KeyA')
 for(const modifiers of [{metaKey:true},{altKey:true},{isComposing:true}])expect(key(canvas,'keydown','KeyW',modifiers).defaultPrevented).toBe(false)
 expect(frames.size).toBe(0)
})
it('stops on canvas blur, window blur, hidden tab and disposal',()=>{
 for(const stop of [()=>canvas.dispatchEvent(new Event('blur')),()=>window.dispatchEvent(new Event('blur')),()=>{Object.assign(document,{hidden:true});document.dispatchEvent(new Event('visibilitychange'))},()=>controller.abort()]){
  key(canvas,'keydown','KeyW');tick(100);tick(150);stop();expect(frames.size).toBe(0)
  const calls=zoom.mock.calls.length;tick(200);expect(zoom).toHaveBeenCalledTimes(calls)
 }
 expect(key(canvas,'keydown','KeyW').defaultPrevented).toBe(false)
})
