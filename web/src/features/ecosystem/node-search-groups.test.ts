import {it,expect} from 'vitest'
// @ts-expect-error Server query implementation is shared with the Worker.
import {queryEcosystem,grams,gramBucket,PAGE_SIZE} from '../../../server/ecosystem-query.mjs'
import {groupNodeSearchResults,nodeSearchSource} from './node-search-groups.js'

const nodes=[
 {id:'source-label:maryland_comptroller:recipient:a',name:'University of Example',type:'Source label'},
 {id:'usgov:recipient:ABC',name:'UNIVERSITY OF EXAMPLE',type:'Organization'},
 {id:'source-label:nonprofit_grant:recipient:a',name:'University of Example',type:'Source label'},
 {id:'county-a',name:'University of Example County',type:'Organization'},
 {id:'county-b',name:'university of example county',type:'Organization'},
 {id:'foundation',name:'University of Example Foundation',type:'Organization'},
 {id:'nonprofit:123456789',name:'University of Example Foundation Inc',type:'Nonprofit organization'},
 {id:'source-label:nonprofit_grant:recipient:f',name:'University of Example Foundation Inc',type:'Source label'},
]
function fixture(compact=true){
 const rows=nodes.map(n=>({id:n.id,...(compact?{name:n.name,type:n.type}:{}),search:`${n.name} ${n.type}`.toLowerCase()}))
 const index={rows,filters:{},gramCounts:{} as Record<string,number>},buckets:Record<string,Record<string,number[]>>={},reads:string[]=[]
 rows.forEach((row,i)=>{for(const gram of grams(row.search)){index.gramCounts[gram]=(index.gramCounts[gram]||0)+1;const bucket=buckets[gramBucket(gram)]??={};(bucket[gram]??=[]).push(i)}})
 const read=async(path:string)=>{
  reads.push(path)
  if(path==='manifest.json')return {version:'fixture'}
  if(path==='fixture/directory/index.json')return structuredClone(index)
  const bucket=path.match(/grams-(\d+)\.json$/);if(bucket)return buckets[bucket[1]]
  const page=path.match(/directory\/(\d+)\.json$/);if(page)return nodes.slice(Number(page[1])*PAGE_SIZE,(Number(page[1])+1)*PAGE_SIZE)
  throw Error('Unexpected artifact '+path)
 }
 return {read,reads}
}
it('groups across raw page boundaries, paginates names, and retains every source identity',async()=>{
 const {read,reads}=fixture()
 const one=(await queryEcosystem(read,'organizations',new URLSearchParams({q:'university',group:'name',limit:'2'}))).body
 const two=(await queryEcosystem(read,'organizations',new URLSearchParams({q:'university',group:'name',limit:'2',offset:String(one.nextOffset),version:one.version}))).body
 expect(one.total).toBe(4);expect(one.nodeTotal).toBe(8);expect(two.nextOffset).toBeNull()
 expect([...one.records,...two.records].flatMap(g=>g.members.map(n=>n.id))).toEqual(nodes.map(n=>n.id))
 expect(one.records[0].members).toHaveLength(3);expect(one.records[1].members).toHaveLength(2)
 expect(reads.some(path=>/directory\/\d+\.json/.test(path))).toBe(false)
 expect((await queryEcosystem(read,'organizations',new URLSearchParams({q:'not-present',group:'name'}))).body.total).toBe(0)
 expect((await queryEcosystem(read,'organizations',new URLSearchParams({q:'university',group:'name',version:'old'}))).status).toBe(409)
})
it('supports old immutable snapshots and leaves ungrouped API consumers unchanged',async()=>{
 const {read}=fixture(false)
 const grouped=(await queryEcosystem(read,'organizations',new URLSearchParams({q:'university',group:'name'}))).body
 expect(grouped.total).toBe(4);expect(grouped.records[0].members).toHaveLength(3)
 const raw=(await queryEcosystem(read,'organizations',new URLSearchParams({q:'university',limit:'2'}))).body
 expect(raw.total).toBe(8);expect(raw.records).toEqual(nodes.slice(0,2));expect(raw.nextOffset).toBe(2)
})
it('fuzzy discovery retrieves article and board variants without promoting structural differences',async()=>{
 const {read}=fixture()
 const result=(await queryEcosystem(read,'organizations',new URLSearchParams({q:'The University of Example',match:'fuzzy'}))).body
 expect(result.truncated).toBe(false);expect(result.records[0].match.automatic).toBe(true)
 expect(result.records.find(n=>n.id==='foundation').match.automatic).toBe(false)
 expect(result.records.map(n=>n.id)).toContain('usgov:recipient:ABC')
})
it('normalizes case, Unicode and whitespace without merging campus, foundation or legal suffixes',()=>{
 const records=[{id:'a',name:'Ａcademy  of Example'},{id:'b',name:'academy of example '},{id:'c',name:'Academy of Example County'},{id:'d',name:'Academy of Example Foundation'},{id:'e',name:'Academy of Example Foundation Inc'}]
 const grouped=groupNodeSearchResults([...records,records[0]])
 expect(grouped).toHaveLength(4);expect(grouped[0].members.map(n=>n.id)).toEqual(['a','b'])
 expect(nodeSearchSource(nodes[0])).toBe('Maryland Comptroller · recipient label')
 expect(nodeSearchSource(nodes[1])).toBe('USAspending · Recipient ABC')
 expect(nodeSearchSource(nodes[6])).toBe('Nonprofit · EIN 123456789')
})
