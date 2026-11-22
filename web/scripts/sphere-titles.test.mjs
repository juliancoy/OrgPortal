import test from 'node:test'
import assert from 'node:assert/strict'
import {sphereTitleLines,paintSphereTitle} from '../src/features/ecosystem/sphere-title-text.js'
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
