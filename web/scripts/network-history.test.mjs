import test from 'node:test'
import assert from 'node:assert/strict'
import {mergeNetworkHistory} from '../src/features/ecosystem/network-history.js'
import {loadPortalEvidence} from '../src/features/ecosystem/portal-ecosystem.js'
test('Blue Water Baltimore archive events are assigned to its existing directory identity',async()=>{
 const {readFile}=await import('node:fs/promises')
 const history=JSON.parse(await readFile(new URL('../public/ecosystem-data/ecosystem-history.json',import.meta.url)))
 const base=JSON.parse(await readFile(new URL('../public/ecosystem-data/ecosystem-portal.json',import.meta.url)))
 const org=base.organizations.find(o=>o.name==='Blue Water Baltimore Events')
 assert(org,'Blue Water Baltimore directory entry')
 const graph=mergeNetworkHistory(base,history)
 const events=graph.events.filter(e=>new URL(e.sourceUrl).hostname.replace(/^www\./,'')==='bluewaterbaltimore.org')
 assert(events.length>0,'Blue Water Baltimore events are retained')
 assert(events.every(e=>e.organizationId===org.id),'Archived events belong to the directory organization')
 assert(events.some(e=>e.archiveSources.includes('baltimore/event_history.json')),'Historical events are retained')
 assert(events.some(e=>e.archiveSources.includes('baltimore/upcoming_events.json')),'Upcoming events are retained')
})
test('non-LifeTech organizations are included in live evidence refresh',async()=>{
 const directory=[{id:'cc',name:'Code Collective',slug:'code-collective',tags:['Technology']}]
 const calls=[];const data=await loadPortalEvidence({organizations:[],relationships:[],financing:[]},async url=>{calls.push(url);return {ok:true,json:async()=>url.includes('/relationships/public?')?{records:[],nextRecordOffset:null}:directory}})
 assert.equal(data.organizations[0].name,'Code Collective');assert(calls.some(url=>url.includes('/relationships/public?')))
})
test('history joins existing organization identities, retains unassigned events and does not duplicate awards',()=>{
 const base={organizations:[{id:'cc',name:'Code Collective'}],relationships:[],financing:[]}
 const record={id:'award',source:'swc',target:'archive-cc',funderId:'swc',recipientId:'archive-cc',amount:600,date:'2026',sourceUrl:''}
 const history={organizations:[{id:'archive-cc',name:'Code Collective'},{id:'swc',name:'Stand with Crypto'}],events:[{id:'one',organizationId:'archive-cc'},{id:'two',organizationId:null}],relationships:[record],financing:[record]}
 const once=mergeNetworkHistory(base,history),twice=mergeNetworkHistory(once,history)
 assert.equal(twice.organizations.length,2);assert.equal(twice.events.length,2);assert.equal(twice.events[0].organizationId,'cc');assert.equal(twice.events[1].organizationId,null);assert.equal(twice.relationships.length,1);assert.equal(twice.financing.length,1)
})

test('federal evidence keeps ceilings and historical programs separate from reported awards',async()=>{
 const {readFile}=await import('node:fs/promises')
 const research=JSON.parse(await readFile(new URL('../public/ecosystem-data/ecosystem-research.json',import.meta.url)))
 const federal=research.relationships.filter(r=>r.id.startsWith('research-federal-'))
 const graph=mergeNetworkHistory({organizations:[],relationships:[],financing:[]},{...research,events:[]})
 const {graphRelationships}=await import('../src/features/ecosystem/portal-ecosystem.js')
 const money=graphRelationships(graph,{moneyOnly:true})
 for(const suffix of ['nsf','sba','doe','arpa-e','dod','darpa','nasa','nist','usda','nifa','fda','cdc','treasury','hhs'])assert(research.organizations.some(o=>o.id==='federal-'+suffix),suffix)
 for(const r of federal){assert(research.organizations.some(o=>o.id===r.source));assert(research.organizations.some(o=>o.id===r.target));assert.match(r.sourceUrl,/^https:\/\//)}
 for(const r of federal.filter(r=>r.kind==='terms')){assert.match(r.amountLabel,/Up to/);assert(!money.some(edge=>edge.id===r.id))}
 assert.equal(federal.find(r=>r.id.endsWith('sba-tedco-fast-2026')).amount,null)
 assert.equal(federal.find(r=>r.id.endsWith('nist-mdmep-2013')).date,'2013-09-06')
 assert(!federal.some(r=>r.type==='Public Health Infrastructure Grant funding'&&r.amount===70896629))
})
