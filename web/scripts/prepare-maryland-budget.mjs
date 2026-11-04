// Extends a verified, version-pinned public dataset; does not replace other evidence.
import {createHash} from 'node:crypto'
import {writeFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {parseArgs} from 'node:util'
import {projectMarylandBudget,apiUrl,statusSourceUrl} from './maryland-budget.mjs'
const {values}=parseArgs({options:{out:{type:'string'},'fiscal-year':{type:'string'},'budget-status':{type:'string'}}})
if(!values.out||values['fiscal-year']!=='2027'||values['budget-status']!=='legislative_appropriation')throw Error('This reviewed import supports FY2027 legislative appropriations only; supply --out --fiscal-year 2027 --budget-status legislative_appropriation')
const base='https://lifetech.fyi/api/org/api/network/ecosystem/public',collections=['organizations','relationships','financing','events','nonprofitProfiles','performanceRecords','performanceAssessments','metadata','positions']
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v!==null&&typeof v==='object'?`{${Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')}}`:JSON.stringify(v)
const hash=v=>createHash('sha256').update(v).digest('hex')
const get=async url=>{const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error(`Source failed (${response.status})`);return response.json()}
let datasetId
const rows=[]
// Pin first, then read independent collections concurrently, checking every page.
const initial=await get(base+'/organizations');datasetId=initial.datasetId
await Promise.all(collections.map(async collection=>{let after='';do{const url=new URL(base+'/'+collection);url.searchParams.set('datasetId',datasetId);if(after)url.searchParams.set('after',after);const page=await get(url);if(page.datasetId!==datasetId||!Array.isArray(page.records))throw Error('Changed public dataset');for(const r of page.records){if(hash(canonical(r.value))!==r.sha256)throw Error('Source checksum mismatch');rows.push({collection,...r})}if(page.next!==null&&(typeof page.next!=='string'||page.next<=after))throw Error('Invalid source cursor');after=page.next}while(after!==null)}))
const digest=rows=>hash([...rows].sort((a,b)=>(a.collection+'\t'+a.key)<(b.collection+'\t'+b.key)?-1:1).map(r=>`${r.collection}\t${r.key}\t${r.sha256}\n`).join(''))
if(digest(rows)!==datasetId)throw Error('Incomplete public dataset')
const targetId='source-label:maryland_comptroller:agency:4d8dd1e934535ab80e79f4f52ea96ad9',targetName='Department of Housing & Community Development'
// Explicitly reviewed state-agency crosswalk; never fuzzy-match a city/county DHCD.
// MD-VIEW label is not a directory registration or a claim of verified ownership.
const target=rows.find(r=>r.collection==='organizations'&&r.value.id===targetId)
// This label normally enters via the native export rather than the snapshot.
if(target&&target.value.name!==targetName)throw Error('Agency identity changed')
const url=new URL(apiUrl);url.searchParams.set('$where',"fiscal_year=2027 AND agency_code='S00'");url.searchParams.set('$limit','5000');url.searchParams.set('$order','organization_code,fund_type_name,fund_source_code')
const sourceRows=await get(url)
const countUrl=new URL(apiUrl);countUrl.searchParams.set('$where',"fiscal_year=2027 AND agency_code='S00'");countUrl.searchParams.set('$select','count(*) AS count,sum(budget) AS total')
const [count]=await get(countUrl)
if(sourceRows.length!==Number(count.count)||Number(count.total)!==902223261)throw Error('Budget count/official FY2027 DHCD total reconciliation failed')
const budget=projectMarylandBudget(sourceRows,{fiscalYear:2027,agencyCode:'S00',targetId,targetName,budgetStatus:'legislative_appropriation'})
if(!target)budget.organizations.push({id:targetId,name:targetName,type:'Source label',entityType:'source_label',identityStatus:'unverified_label',directory:false,category:'state-government',sourceCategory:'maryland_comptroller',website:'https://dhcd.maryland.gov/',relevance:'Maryland DHCD agency label in MD-VIEW, explicitly crosswalked to DBM budget agency S00. Not a directory registration.'})
function add(collection,value){const key=hash(value.id),sha256=hash(canonical(value)),old=rows.find(r=>r.collection===collection&&r.key===key);if(old){if(old.sha256!==sha256)throw Error('Budget source already exists with different data');return}rows.push({collection,key,value,sha256})}
for(const collection of ['organizations','relationships'])for(const value of budget[collection])add(collection,value)
add('metadata',{id:'data:marylandBudgetCoverage',value:{fiscalYear:2027,budgetStatus:'legislative_appropriation',agencyCode:'S00',targetId,records:budget.relationships.length,total:902223261,currency:'USD',datasetUrl:apiUrl,statusSourceUrl,scope:'DHCD operating-budget funding-source rows only; reimbursable funds and separate capital-budget allocations are not included.',retrievedAt:new Date().toISOString(),sourceSha256:hash(canonical(sourceRows))}})
rows.sort((a,b)=>(a.collection+'\t'+a.key)<(b.collection+'\t'+b.key)?-1:1)
const out=resolve(values.out);await mkdir(resolve(out,'..'),{recursive:true,mode:0o700});await writeFile(out,JSON.stringify({datasetId:digest(rows),rows})+'\n',{mode:0o600});await writeFile(out+'.source.json',JSON.stringify(sourceRows)+'\n',{mode:0o600})
console.log(JSON.stringify({previousDatasetId:datasetId,datasetId:digest(rows),records:rows.length,budgetRecords:budget.relationships.length,budgetTotal:Number(count.total),out}))
