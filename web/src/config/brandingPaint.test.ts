import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {rememberBrandingPaint} from './brandingPaint'
const boot=readFileSync(new URL('../../index.html',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)![1]
function paint(entry?:unknown){
 const values=new Map([['orgportal.theme','dark'],...(entry?[['orgportal.brand-paint.v1',JSON.stringify(entry)]]:[])])
 const root={dataset:{} as Record<string,string>,removeAttribute(name:string){delete this.dataset[name.replace('data-','')]}}
 const styles:{id?:string;textContent?:string}[]=[]
 runInNewContext(boot,{localStorage:{getItem:(k:string)=>values.get(k)||null,removeItem:(k:string)=>values.delete(k)},location:{hostname:'lifetech.fyi'},Date:{now:()=>100000},document:{documentElement:root,head:{appendChild:(s:object)=>styles.push(s)},createElement:()=>({})}})
 return {root,styles,values}
}
describe('branding before the first document paint',()=>{
 it('uses the known host brand on a first visit',()=>{expect(paint().root.dataset.portalProfile).toBe('lifetech')})
 it('restores the selected layout and both palettes before application JavaScript runs',()=>{
  const result=paint({savedAt:99999,profile:'lifetech',tenant:'life',theme:'ankhtech',light:{surface:'#FFFFFF'},dark:{surface:'#112233'}})
  expect(result.root.dataset.organizationTheme).toBe('ankhtech');expect(result.styles[0].textContent).toContain('--surface:#112233;');expect(result.styles[0].textContent).toContain('[data-theme="dark"]')
 })
 it('rejects stale snapshots and executable or remote CSS',()=>{
  for(const entry of [{savedAt:1-86400000,profile:'lifetech',light:{},dark:{}},{savedAt:99999,profile:'lifetech',theme:'bad',light:{surface:'url(https://other.test)'},dark:{surface:'#112233'}}]){
   const result=paint(entry);expect(result.styles).toHaveLength(0);expect(result.values.has('orgportal.brand-paint.v1')).toBe(false)
  }
 })
 it('caches only public colors and tolerates blocked storage',()=>{
  const values:string[]=[];rememberBrandingPaint(null,'orgportal','',{setItem:(_k,v)=>values.push(v)},100)
  expect(JSON.parse(values[0])).toEqual({savedAt:100,profile:'orgportal',tenant:'',theme:'',light:{},dark:{}})
  expect(()=>rememberBrandingPaint(null,'orgportal','',{setItem:()=>{throw Error('blocked')}})).not.toThrow()
 })
})
