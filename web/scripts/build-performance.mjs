import {readFile,writeFile,rename} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
const reviewPath='/ecosystem-data/sources/maryland-medaaf-review.json'
const fields=['awardKey','cohort','metric','unit','commitment','result','reviewerOrganization','methodology','commitmentUrl','resultUrl','reviewUrl','dueDate','measuredDate','reviewedDate','direction','target','actual','evidenceBasis']
function publicUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password}catch{return false}}
function date(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value}
export function buildPerformance(government,input){
 if(!Array.isArray(government?.relationships)||!Array.isArray(input?.assessments)||!Array.isArray(input.records??[]))throw Error('Expected government awards and reviewed assessment arrays')
 const records=government.relationships.map(a=>({awardKey:a.awardKey,awardId:a.awardId,recipientId:a.target,recipientName:a.targetLabel,identified:a.recipientIdentity==='identified',agency:a.sourceLabel,amount:a.amount,financialMeasure:'lifetime cumulative obligations',sourceName:'USAspending',sourceUrl:a.sourceUrl,description:(a.description||'').slice(0,300),program:'Federal grants',networkOrganizationId:a.target}))
 const awards=new Map(records.map(a=>[a.awardKey,a])),seen=new Set()
 if(awards.size!==records.length)throw Error('Duplicate government award identity')
 for(const r of input.records??[]){
  if(!r.awardKey?.startsWith('md-commerce:')||awards.has(r.awardKey)||!r.recipientId?.startsWith('md-commerce:reported-name:')||r.identified!==true)throw Error('State observation needs a unique source-scoped named identity')
  for(const k of ['awardId','recipientName','agency','description','program','sourceName'])if(typeof r[k]!=='string'||!r[k].trim()||r[k].length>4000)throw Error(`Invalid state observation ${k}`)
  if(!publicUrl(r.sourceUrl)||!/^https:\/\/commerce\.maryland\.gov\//.test(r.sourceUrl)||r.financialMeasure!=='original conditional loan principal'||!Number.isFinite(r.amount)||r.amount<0||!/^[a-f0-9]{64}$/.test(r.sourceSha256))throw Error('State observation requires an official source, checksum and separate loan principal measure')
  const record=Object.fromEntries(['awardKey','awardId','recipientId','recipientName','identified','agency','amount','financialMeasure','sourceName','sourceUrl','description','program','sourceSha256'].map(k=>[k,r[k]]))
  records.push(record);awards.set(r.awardKey,record)
 }
 const assessments=input.assessments.map(a=>{
  const award=awards.get(a.awardKey)
  if(!award||!award.identified)throw Error('Assessment needs an identified award')
  if(seen.has(a.awardKey))throw Error('Duplicate award assessment');seen.add(a.awardKey)
  for(const k of ['cohort','metric','unit','commitment','result','reviewerOrganization','methodology'])if(typeof a[k]!=='string'||!a[k].trim()||a[k].length>4000)throw Error(`Missing or invalid ${k}`)
  for(const k of ['commitmentUrl','resultUrl'])if(!publicUrl(a[k]))throw Error(`Invalid ${k}`)
  if(!publicUrl(a.reviewUrl)&&a.reviewUrl!==reviewPath)throw Error('Invalid reviewUrl')
  if(!['certified','company-reported','agency-measured'].includes(a.evidenceBasis))throw Error('Record the evidence basis')
  for(const k of ['dueDate','measuredDate','reviewedDate'])if(!date(a[k]))throw Error(`Invalid ${k}`)
  if(a.measuredDate<a.dueDate||a.reviewedDate<a.measuredDate)throw Error('Assessment must follow the outcome deadline and measurement')
  if(!['higher','lower'].includes(a.direction)||![a.target,a.actual].every(Number.isFinite)||a.target<=0||a.actual<0)throw Error('Invalid outcome values')
  // Zero actual for a lower-is-better metric meets the target but has no finite ratio.
  const attainment=a.direction==='lower'&&a.actual===0?null:a.direction==='higher'?a.actual/a.target:a.target/a.actual
  if(attainment!==null&&!Number.isFinite(attainment))throw Error('Attainment must be finite')
  return {...Object.fromEntries(fields.map(k=>[k,a[k]])),attainment,meetsTarget:a.direction==='higher'?a.actual>=a.target:a.actual<=a.target}
 })
 for(const r of input.records??[])if(!seen.has(r.awardKey))throw Error('Each state pilot record needs its reviewed assessment')
 const cohorts=new Map()
 for(const a of assessments){const signature=JSON.stringify([a.metric,a.unit,a.direction,a.methodology,awards.get(a.awardKey).program]);if(cohorts.has(a.cohort)&&cohorts.get(a.cohort)!==signature)throw Error('Cohort program, metric, units, direction and methodology must match');cohorts.set(a.cohort,signature)}
 return {schemaVersion:2,generatedAt:new Date().toISOString(),coverage:government.coverage,records,assessments}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const root=fileURLToPath(new URL('../',import.meta.url)),arg=process.argv.indexOf('--assessments')
 if(arg>=0&&!process.argv[arg+1])throw Error('Provide an assessment JSON path')
 const input=JSON.parse(await readFile(arg<0?resolve(root,'data/performance-assessments.json'):resolve(process.argv[arg+1]),'utf8'))
 const government=JSON.parse(await readFile(resolve(root,'public/ecosystem-data/ecosystem-government.json'),'utf8'))
 const output=resolve(root,'public/ecosystem-data/ecosystem-performance.json'),data=buildPerformance(government,input)
 await writeFile(output+'.tmp',JSON.stringify(data)+'\n');await rename(output+'.tmp',output)
 console.log(`${data.records.length} funding records; ${data.assessments.length} reviewed historical assessments`)
}
