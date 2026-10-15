import {readFile,writeFile,mkdir,rename} from 'node:fs/promises'
import {governmentTransactionsSql} from './lib/government-transactions.mjs'
import {collectGovernmentAwards,normalizeAwards} from './lib/government-awards.mjs'
const start=process.argv[2]||'2024-10-01',end=process.argv[3]||'2025-09-30'
for(const date of [start,end])if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date).toISOString().slice(0,10)!==date)throw new Error('Use YYYY-MM-DD dates')
if(start>end)throw new Error('Start must precede end')
const input=process.argv[4]&&process.argv[4]!=='--resume'?JSON.parse(await readFile(process.argv[4],'utf8')):null
const seed=process.argv[4]==='--resume'?JSON.parse(await readFile(process.argv[5],'utf8')):null
if((seed||input) && JSON.stringify((seed||input).requests[0]?.filters)!==JSON.stringify((await import('./lib/government-awards.mjs')).awardQuery(1,start,end).filters))throw new Error('Resume query does not match requested coverage')
const raw=input||await collectGovernmentAwards(fetch,start,end,console.log,seed),retrievedAt=input?.retrievedAt||new Date().toISOString()
if(raw.expectedAwardCount!==raw.results.length)throw new Error('Source must reconcile with the independent government count')
const out=new URL('../public/ecosystem-data/',import.meta.url)
// Keep only the explicitly requested public organization/award fields, never contacts.
const source={retrievedAt,expectedAwardCount:raw.expectedAwardCount,messages:raw.messages,endpoint:'https://api.usaspending.gov/api/v2/search/spending_by_award/',requests:raw.requests,results:raw.results.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>raw.requests[0].fields.includes(key))))}
await mkdir(out,{recursive:true})
// Immutable retrieval artifact: publishing the evidence last preserves the previous snapshot on failures.
const artifact=`government-awards-source-${retrievedAt.replaceAll(':','-')}.json`
await writeFile(new URL(artifact,out),JSON.stringify(source)+'\n')
const evidence=normalizeAwards(raw,retrievedAt,{start,end})
evidence.sourceArtifact=artifact
for(const record of [...evidence.relationships,...evidence.financing])record.provenance.sourceArtifact=artifact
await mkdir(new URL('../../artifacts/government/',import.meta.url),{recursive:true})
await writeFile(new URL('../../artifacts/government/award-records.sql',import.meta.url),governmentTransactionsSql(evidence))
await writeFile(new URL('ecosystem-government.json.tmp',out),JSON.stringify(evidence)+'\n')
await rename(new URL('ecosystem-government.json.tmp',out),new URL('ecosystem-government.json',out))
console.log(`Imported ${evidence.relationships.length} Maryland federal grants; ${evidence.organizations.length} organizations; ${start} through ${end}`)

await import('./build-network-history.mjs')

await import('./build-performance.mjs').then(async ({buildPerformance})=>{
 const input=JSON.parse(await readFile(new URL('../data/performance-assessments.json',import.meta.url),'utf8'))
 const data=buildPerformance(evidence,input)
 await writeFile(new URL('ecosystem-performance.json.tmp',out),JSON.stringify(data)+'\n')
 await rename(new URL('ecosystem-performance.json.tmp',out),new URL('ecosystem-performance.json',out))
})
