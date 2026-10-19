import {test} from 'node:test'
import assert from 'node:assert/strict'
import {uniqueNetworkLinks} from '../src/features/ecosystem/network-links.js'

test('one rendered link per unordered organization pair, across types and directions',()=>{
 const edges=[
  {id:'grant',source:'a',target:'b',relationship:'grant'},
  {id:'support',source:'a',target:'b',relationship:'support'},
  {id:'reverse',source:{id:'b'},target:{id:'a'}},
  {id:'other',source:'a',target:'c'},
 ]
 assert.deepEqual(uniqueNetworkLinks(edges).map(e=>e.id),['grant','other'])
 assert.equal(edges.length,4)
 assert.deepEqual(uniqueNetworkLinks(edges.filter(e=>e.relationship==='support')).map(e=>e.id),['support'])
})
