import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {financialNodePies,foldFundNodes,pieWedgePath} from '../src/features/ecosystem/fund-pies.js'
import {mergeNetworkHistory} from '../src/features/ecosystem/network-history.js'
import {orgDetails} from '../src/features/ecosystem/ecosystem-view.js'
const organizations=[{id:'tedco',name:'TEDCO'},{id:'fund',name:'TEDCO Equitech Growth Fund'},{id:'a',name:'Company A'},{id:'b',name:'Company B'},{id:'state',name:'State'}]
const edge=(overrides={})=>({id:'award',source:'fund',target:'a',amount:100,currency:'USD',kind:'transfer',date:'2026',sourceUrl:'https://tedcomd.com/award',...overrides})
const fixture=(relationships,financing=[])=>({organizations:structuredClone(organizations),relationships,financing})
test('TEDCO owns fund presentation without changing source identities or evidence',()=>{
 const data=fixture([edge()]);const graph=foldFundNodes(data)
 assert.equal(graph.organizations.some(o=>o.id==='fund'),false)
 assert.equal(graph.relationships[0].source,'tedco');assert.equal(graph.relationships[0].fundId,'fund')
 assert.equal(data.relationships[0].source,'fund');assert.equal(data.organizations.find(o=>o.id==='fund').entityType,'fund')
})
test('pie shares are proportional, consistent across funder and recipient, and do not duplicate financing',()=>{
 const data=fixture([edge(),edge({id:'award-2',target:'b',amount:300})],[{...edge(),id:'finance',funderId:'fund',recipientId:'a'}])
 const pies=financialNodePies(data),parent=pies.get('tedco');assert.equal(parent.total,400);assert.equal(parent.direction,'outgoing')
 assert.equal(pies.get('a').total,100);assert.equal(parent.slices[0].color,pies.get('a').slices[0].color)
 const standalone=financialNodePies(fixture([edge({source:'state',target:'a'}),edge({id:'second',target:'a',amount:300})])).get('a')
 assert.deepEqual(standalone.slices.map(s=>s.share),[.75,.25]);assert.equal(standalone.slices.at(-1).endAngle,Math.PI*1.5)
})
test('unknown, non-USD, aggregate, terms and voided records do not inflate proportions',()=>{
 const data=fixture([edge(),...[
 {amount:null},{amount:10000,currency:'EUR'},{amount:10000,kind:'portfolio'},
 {amount:10000,kind:'terms'},{amount:10000,status:'voided'},{amount:NaN},{amount:-1},
 ].map((o,i)=>edge({id:String(i),date:String(i),...o}))]);const pie=financialNodePies(data).get('tedco')
 assert.equal(pie.total,100);assert.equal(pie.omitted,4)
})
test('incoming receipts and onward awards are never added together',()=>{
 const pies=financialNodePies(fixture([edge({source:'state',target:'tedco',amount:1000000}),edge()]))
 assert.equal(pies.get('tedco').total,100);assert.equal(pies.get('tedco').direction,'outgoing')
 assert.equal(pies.get('state').total,1000000)
})
test('capitalization is opt-in, full-circle and large SVG sectors are valid',()=>{
 const data=fixture([edge({kind:'capitalization'})]);assert.equal(financialNodePies(data).size,0)
 assert.equal(financialNodePies(data,{includeCapitalization:true}).get('a').total,100)
 assert.equal((pieWedgePath(0,0,10,0,Math.PI*2).match(/ a /g)||[]).length,2)
 assert.match(pieWedgePath(0,0,10,0,Math.PI*1.5),/0 1 1/)
})
test('real TEDCO breakdown excludes portfolio overlap and preserves fund-specific inspector evidence',async()=>{
 const read=async file=>JSON.parse(await readFile(new URL('../public/ecosystem-data/'+file,import.meta.url)))
 const data=mergeNetworkHistory(await read('ecosystem-portal.json'),await read('ecosystem-relationships.json'))
 const pie=financialNodePies(data).get('org-tedco');assert.equal(pie.total,1250400)
 assert.deepEqual(pie.slices.map(s=>s.amount),[500400,500000,250000])
 const html=orgDetails(data.organizations.find(o=>o.id==='org-tedco'),data)
 assert.match(html,/Funds within TEDCO/);assert.match(html,/Fund administered by TEDCO/);assert.match(html,/\$250,000/);assert.match(html,/not fund size/)
})
