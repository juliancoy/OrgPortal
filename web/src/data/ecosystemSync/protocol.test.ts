import {describe,it,expect} from 'vitest'
import {mergeChanges,nextCounter,type EcosystemChange} from './protocol'
const change=(id:string,replicaId:string,counter:number,deleted=false):EcosystemChange=>({id,replicaId,counter,entity:'funding',recordId:'swc-2026',deleted,value:deleted?null:{amount:600,id}})
describe('ecosystem convergence protocol',()=>{
 it('converges after offline concurrent edits regardless of order and repeated delivery',()=>{
  const a=change('a','browser',2),b=change('b','sqlite',2),c=change('c','d1',3)
  const left=mergeChanges(mergeChanges({},[a,b]),[c,a]),right=mergeChanges(mergeChanges({},[c,b]),[a,b])
  expect(left).toEqual(right);expect(left['funding:swc-2026']).toEqual(c)
 })
 it('retains deletion markers across stale replay and permits a later explicit recreation',()=>{
  const original=change('a','browser',1),deleted=change('b','sqlite',2,true)
  const state=mergeChanges({},[original,deleted]);expect(mergeChanges(state,[original])).toEqual(state)
  expect(mergeChanges(state,[change('c','browser',nextCounter(state))])['funding:swc-2026'].deleted).toBe(false)
 })
 it('rejects a malformed batch and reused identities rather than partially applying it',()=>{
  const a=change('a','browser',1);expect(()=>mergeChanges({},[a,{...a,id:'b',counter:Infinity}])).toThrow()
  expect(()=>mergeChanges({'funding:swc-2026':a},[{...a,value:{amount:800}}])).toThrow('Conflicting reuse')
 })
})
