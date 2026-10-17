import {test} from 'node:test'
import assert from 'node:assert/strict'
import {lawMagnitude,forceDistanceLaw} from '../src/features/ecosystem/force-law.js'
test('linear gain and power exponent produce distinct distance laws',()=>{
 assert.equal(lawMagnitude(0,'power',2),0)
 assert.equal(lawMagnitude(.5,'linear',2),1)
 assert.equal(lawMagnitude(.5,'power',2),.25)
 assert.ok(Number.isFinite(lawMagnitude(1e100,'power',10)))
})
for(const dimensions of [2,3])test(`${dimensions}D laws attract and repel with finite extreme settings`,()=>{
 for(const law of ['linear','power'])for(const sign of [-1,1]){
  const nodes=[{x:-50,y:0,z:0,vx:0,vy:0,vz:0},{x:50,y:0,z:0,vx:0,vy:0,vz:0}]
  const force=forceDistanceLaw({strength:()=>sign*20,law,exponent:10,dimensions})
  force.initialize(nodes);force(.35)
  assert.equal(Math.sign(nodes[0].vx),sign)
  assert.equal(nodes[0].vx,-nodes[1].vx)
  assert.ok(nodes.every(n=>[n.vx,n.vy,n.vz].every(Number.isFinite)))
 }
})
