import test from 'node:test'
import assert from 'node:assert/strict'
import {sphereTitleLines,paintSphereTitle,sphereTitleReadable} from '../src/features/ecosystem/sphere-title-text.js'
test('surface titles wrap words and long tokens, preserving text until the bounded overflow',()=>{
 const title='University of Maryland Department of Health'
 assert.equal(sphereTitleLines(title).join(' '),title)
 assert(sphereTitleLines(title).every(line=>line.length<=18))
 assert.deepEqual(sphereTitleLines(''),[])
 assert.deepEqual(sphereTitleLines('a'.repeat(30),10,2),['aaaaaaaaaa','aaaaaaaaa…'])
 assert.equal(sphereTitleLines('one two three four five six seven eight nine',8,3).length,3)
})
test('surface text is centered and outlined without a label box',()=>{
 const calls=[],context={save(){},restore(){},strokeText(...args){calls.push(['stroke',...args])},fillText(...args){calls.push(['fill',...args])}}
 paintSphereTitle(context,'MD Department of Health',100,50,180,90)
 const text=calls.filter(c=>c[0]==='fill')
 assert(text.length>1);assert(text.every(c=>c[2]===100));assert.equal((text[0][3]+text.at(-1)[3])/2,50)
 assert.equal(context.fillStyle,'#fff');assert(context.lineWidth>0)
})

test('surface titles require readable screen pixels, even with adaptive low resolution',()=>{
 const name='MD Department of Health'
 for(const curved of [false,true]){
  assert.equal(sphereTitleReadable(name,16,curved),false)
  assert.equal(sphereTitleReadable(name,160,curved),true)
  assert.equal(sphereTitleReadable(name,80,curved,1),true)
  assert.equal(sphereTitleReadable(name,80,curved,.4),curved)
  assert.equal(sphereTitleReadable(name,16,curved,3),false,'high DPI cannot rescue subpixel CSS text')
  assert.equal(sphereTitleReadable('UMD',32,curved),true)
  assert.equal(sphereTitleReadable('',100,curved),false)
 }
})
test('curved titles stay visible at half the projected radius without changing flat labels',()=>{
 const name='MD Department of Health'
 assert.equal(sphereTitleReadable(name,40,true),true)
 assert.equal(sphereTitleReadable(name,40,false),false)
 assert.equal(sphereTitleReadable(name,20,true),false,'still cull unreadably small text')
 assert.equal(sphereTitleReadable(name,40,true,.4),false,'respect actual render resolution')
 assert.equal(sphereTitleReadable('UMD',8,true),true)
 assert.equal(sphereTitleReadable('UMD',7,true),false)
})
