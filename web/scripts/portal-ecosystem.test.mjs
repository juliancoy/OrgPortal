import test from 'node:test'
import assert from 'node:assert/strict'
import {mergePortalEvidence,graphRelationships,financialNodeAmounts,financialNodeRadius,loadPortalEvidence} from '../src/features/ecosystem/portal-ecosystem.js'
const base={organizations:[{id:'org-funder',name:'Funder',website:'https://funder.test/',publicEmails:[]}],relationships:[],financing:[],dashboard:[]}
const orgs=[{id:'org-funder',name:'Funder',slug:'funder',tags:[]},{id:'venture',name:'Venture',slug:'venture',tags:['LifeTech','Venture']}]
const record={id:'support:one',record_id:'one',record_type:'organization_support',status:'reported',transaction_type:'acceleration',from_organization_id:'org-funder',to_organization_id:'venture',from_label:'Funder',to_label:'Venture',amount:null,source_url:'https://funder.test/cohort',description:'Cohort',notes:'',evidence:'Named participant'}
test('cohort relationships appear in full map and never become money',()=>{const data=mergePortalEvidence(base,orgs,[record,record]);assert.equal(data.relationships.length,1);assert.equal(graphRelationships(data).length,1);assert.equal(graphRelationships(data,{moneyOnly:true}).length,0);assert.equal(data.organizations[1].proximity,null);assert.equal(data.financing.length,0)})
test('refresh is idempotent and voided evidence is removed',()=>{const first=mergePortalEvidence(base,orgs,[record]);const second=mergePortalEvidence(first,orgs,[record]);assert.equal(second.relationships.length,1);assert.equal(mergePortalEvidence(second,orgs,[{...record,status:'voided'}]).relationships.length,0)})
test('awards preserve reported status and amounts; capitalizations are opt-in',()=>{const data=mergePortalEvidence(base,orgs,[{...record,transaction_type:'transfer',amount:4000,currency:'USD'},{...record,id:'support:capital',record_id:'capital',transaction_type:'capitalization'}]);assert.equal(graphRelationships(data,{moneyOnly:true}).length,1);assert.equal(graphRelationships(data,{moneyOnly:true,includeCapitalization:true}).length,2);assert.equal(data.financing[0].status,'reported');assert.equal(data.financing[0].amount,4000)})
test('imported workbook records are not duplicated and unsafe evidence is omitted',()=>{const data=mergePortalEvidence(base,orgs,[{...record,record_id:'bmoremedtech:existing'},{...record,source_url:'javascript:alert(1)'}]);assert.equal(data.relationships.length,1);assert.equal(data.relationships[0].sourceUrl,'')})

test('financial sizing avoids overlap, unknown amounts and currency mixing',()=>{
 const edge=(amount,currency='USD',kind='transfer')=>({source:'a',target:'b',amount,currency,kind})
 const data={relationships:[edge(1000),edge(2000),edge(null),edge(10000,'EUR'),edge(100000,'USD','capitalization')]}
 assert.equal(financialNodeAmounts(data).get('a'),3000)
 assert.equal(financialNodeAmounts(data,{includeCapitalization:true}).get('b'),103000)
 assert.equal(financialNodeAmounts({relationships:[{...edge(1000000),currency:undefined,amountLabel:'$1,000,000'}]}).get('a'),1000000)
 assert.equal(financialNodeRadius(null),6)
 assert(financialNodeRadius(100000000)>financialNodeRadius(2000))
})
test('loads directories and support evidence beyond 500 without dropping recipient endpoints',async()=>{
 const directory=[orgs[0],...Array.from({length:500},(_,i)=>({id:`venture-${i}`,slug:`venture-${i}`,name:`Venture ${i}`,tags:[]}))]
 const records=directory.slice(1).map(o=>({...record,id:`support:${o.id}`,record_id:o.id,to_organization_id:o.id}))
 const calls=[]
 const fetcher=async path=>{calls.push(path);const url=new URL(path,'https://example.test');const offset=Number(url.searchParams.get('offset'));return {ok:true,json:async()=>url.pathname.endsWith('/orgs/public')?directory.slice(offset,offset+500):{records:records.slice(offset,offset+499),nextRecordOffset:offset===0?499:null}}}
 const data=await loadPortalEvidence(base,fetcher)
 assert.equal(data.organizations.length,501);assert.equal(data.relationships.length,500)
 assert(calls.some(path=>path.includes('offset=500')));assert(calls.some(path=>path.includes('relationships/public?offset=499')))
 assert.equal(calls.length,4,'Two directory pages and two relationship pages, independent of organization count')
})
test('rejects incomplete or looping support pagination',async()=>{
 for(const nextRecordOffset of [undefined,0,'500'])await assert.rejects(()=>loadPortalEvidence(base,async path=>({ok:true,json:async()=>path.includes('/relationships/public?')?{records:[record],nextRecordOffset}:[orgs[0]]})),/incomplete/)
})
test('older deployments retain per-organization support refresh until their public feed is available',async()=>{
 const calls=[]
 const data=await loadPortalEvidence(base,async path=>{
  calls.push(path)
  if(path.includes('/relationships/public?'))return {ok:false,status:404}
  return {ok:true,json:async()=>path.includes('/support?')?{records:[record],nextRecordOffset:null}:orgs}
 })
 assert.equal(data.relationships.length,1);assert(calls.some(path=>path.includes('/support?')))
})


test('government classes distinguish jurisdiction without reclassifying universities or municipalities',async()=>{
 const {governmentCategory,applyGovernmentClasses}=await import('../src/features/ecosystem/ecosystem.js')
 for(const name of ['National Institutes of Health','U.S. Economic Development Administration'])assert.equal(governmentCategory({name}),'federal-government')
 for(const name of ['TEDCO','TEDCO Equitech Growth Fund','Maryland Department of Commerce','Maryland Port Commission'])assert.equal(governmentCategory({name}),'state-government')
 for(const name of ['University of Maryland, Baltimore','Morgan State University','Baltimore City','Howard County Government','Maryland Food Bank'])assert.equal(governmentCategory({name}),null)
 const merged=mergePortalEvidence(base,[...orgs,{id:'gov',name:'Example agency',tags:['State government']}],[])
 assert.equal(merged.organizations.find(o=>o.id==='gov').category,'state-government')
 assert.equal(applyGovernmentClasses({organizations:[{name:'NIH',website:'https://www.nih.gov/',category:'funding'}]}).organizations[0].category,'federal-government')
})


test('inspector preserves sourced pictures and escapes relationship evidence',async()=>{
 const {orgDetails,edgeDetails}=await import('../src/features/ecosystem/ecosystem-view.js')
 const data=mergePortalEvidence(base,[{...orgs[0],image_url:'https://funder.test/logo.png',source_url:'https://funder.test/'}],[])
 assert.equal(data.organizations[0].imageUrl,'https://funder.test/logo.png')
 const websitePhoto=mergePortalEvidence({...base,organizations:[{...base.organizations[0],imageUrl:'https://funder.test/preview.png',imageCaption:'Published website preview image'}]},[{...orgs[0],image_url:null}],[])
 assert.equal(websitePhoto.organizations[0].imageUrl,'https://funder.test/preview.png')
 data.organizations[0].sourceRows=[]
 const detail=orgDetails(data.organizations[0],data);assert(detail.includes('logo.png'));assert(detail.includes('Image source'))
 const html=edgeDetails({source:'org-funder',target:null,sourceLabel:'<script>',targetLabel:'Recipient',type:'Award',amountLabel:'USD 100',sourceUrl:'https://source.test/',evidence:'<img onerror=bad>',notes:'Payment unverified',provenance:{sheet:'OrgPortal'}},data)
 assert(html.includes('https://source.test/'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<img onerror=bad>'))
 const unsafe=orgDetails({...data.organizations[0],imageUrl:'javascript:bad'},data);assert(!unsafe.includes('src="javascript:'))
})
test('USD volume sums distinct records, counts self-transfers once and excludes voided records',()=>{
 const one={id:'one',source:'a',target:'b',kind:'transfer',currency:'USD',amount:1000}
 const amounts=financialNodeAmounts({relationships:[one,one,{...one,id:'two',amount:2000},{...one,id:'self',target:'a',amount:500},{...one,id:'void',status:'voided',amount:999999}]})
 assert.equal(amounts.get('a'),3500);assert.equal(amounts.get('b'),3000)
})

test('directory matching preserves exact IDs and ambiguous name/website evidence',()=>{
 const snapshot={organizations:[{id:'a',name:'Same',website:'https://a.test/'},{id:'b',name:'Same',website:'https://b.test/'},{id:'c',name:'Unique',website:'https://c.test/'}],relationships:[],financing:[]}
 const merged=mergePortalEvidence(snapshot,[{id:'remote-ambiguous',name:'Same',slug:'ambiguous',source_url:'https://a.test/'},{id:'remote-c',name:'Different',slug:'unique',image_url:null,source_url:'https://c.test/'},{id:'b',name:'Unique',slug:'exact',image_url:null}],[])
 assert.ok(merged.organizations.some(o=>o.id==='remote-ambiguous'))
 assert.equal(merged.organizations.some(o=>o.id==='remote-c'),false)
 assert.equal(merged.organizations.find(o=>o.id==='b').portalSlug,'exact')
 assert.equal(merged.organizations.find(o=>o.id==='c').portalSlug,'unique')
})
