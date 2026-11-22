import {createReadStream} from 'node:fs'
import {createInterface} from 'node:readline'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {queryEcosystem} from '../server/ecosystem-query.mjs'
const folder=new URL('../public/ecosystem-data/query/',import.meta.url)
const read=async path=>JSON.parse(await readFile(new URL(path,folder),'utf8'))
const manifest=await read('manifest.json'),version=manifest.version
const collection=async(version,name)=>(await Promise.all((await readdir(new URL(`${version}/${name}/`,folder))).filter(f=>/^\d+\.json$/.test(f)).sort((a,b)=>parseInt(a)-parseInt(b)).map(f=>read(`${version}/${name}/${f}`)))).flat()
const rows=await collection(version,'relationships'),organizations=await collection(version,'organizations')
const external=rows.filter(r=>r.sourceRecordType==='external_financial_observation')
const query=async org=>(await queryEcosystem(read,'organization-evidence',new URLSearchParams({org,limit:'1'}))).body
const state=await query('state-of-maryland')
assert.equal(state.children.length,80);assert.equal(state.children.filter(c=>c.classification==='department').length,24);assert.equal(state.children.filter(c=>c.classification==='budget_heading').length,5)
assert.equal(new Set(external.map(r=>r.transactionRecordId)).size,external.length)
assert.equal(external.length,manifest.transactionalCoverage.comptrollerRecords)
const attached=external.filter(r=>r.agencyAttachment),stateIds=new Set(state.children.map(c=>c.id))
assert(attached.every(r=>stateIds.has(r.source)))
assert(attached.every(r=>r.sourceAgency.code===r.provenance.agency_code&&r.sourceAgency.label===r.sourceLabel))
for(const name of ['Department of Housing & Community Development','Comptroller of Maryland']) {
 const member=state.children.find(c=>c.name===name);assert(member)
 const profile=await query(member.id),direct=rows.filter(r=>r.source===member.id||r.target===member.id)
 assert.equal(profile.total,new Set(direct.map(r=>r.transactionRecordId||r.id)).size)
 const counts={};for(const group of profile.groups)counts[group.kind]=(counts[group.kind]||0)+group.count
 assert(counts.approval>0);assert(counts.transfer>0);assert(counts.appropriation>0)
 console.log(JSON.stringify({name,total:profile.total,counts}))
}
if(process.argv[2]) {
 const byId=new Map(external.map(row=>[row.transactionRecordId,row])),digest=createHash('sha256');let count=0
 for await(const line of createInterface({input:createReadStream(process.argv[2]),crlfDelay:Infinity})) {
  digest.update(line+'\n');if(!line)continue
  const original=JSON.parse(line),row=byId.get(original.id);assert(row,original.id);count++
  assert.equal(Math.round(row.amount*100),original.amount_cents)
  for(const [field,source] of [['sourceLabel','agency_label'],['targetLabel','recipient_label'],['financialFactType','fact_type'],['sourceUrl','source_url'],['date','occurred_at'],['provenance','metadata']])assert.deepEqual(row[field],original[source],`${row.id} ${field}`)
  assert.equal(row.kind,original.dataset==='bpw'?'approval':'transfer');assert.equal(row.currency,'USD');byId.delete(original.id)
 }
 assert.equal(byId.size,0);assert.equal(count,external.length)
 console.log(JSON.stringify({originalObservationSha256:digest.digest('hex'),preservedObservations:count}))
 console.log('Every external observation retains its ID, signed cents, currency, source labels, financial fact type, source URL, date and metadata against the original imported evidence.')
}
assert(!attached.some(row=>organizations.find(org=>org.id===row.source)?.entityType==='budget_heading'))
console.log(JSON.stringify({version,externalRecords:external.length,reviewedCodeAttachments:attached.length,sourceAgenciesWithoutCodeAttachment:new Set(external.filter(r=>!r.agencyAttachment).map(r=>r.source)).size,departments:24,budgetEntries:80}))
