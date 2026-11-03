// Extends a verified, version-pinned public dataset; does not replace other evidence.
import {createHash} from 'node:crypto'
import {writeFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {parseArgs} from 'node:util'
import {apiUrl,statusSourceUrl,datasetUrl} from './maryland-budget.mjs'
import {projectMarylandGovernment,marylandId,governmentSource} from './maryland-state-government.mjs'
import {readFile} from 'node:fs/promises'
const {values}=parseArgs({options:{out:{type:'string'},'fiscal-year':{type:'string'},'budget-status':{type:'string'}}})
if(!values.out||values['fiscal-year']!=='2027'||values['budget-status']!=='legislative_appropriation')throw Error('This reviewed import supports FY2027 legislative appropriations only; supply --out --fiscal-year 2027 --budget-status legislative_appropriation')
const base='https://lifetech.fyi/api/org/api/network/ecosystem/public',collections=['organizations','relationships','financing','events','nonprofitProfiles','performanceRecords','performanceAssessments','metadata','positions']
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v!==null&&typeof v==='object'?`{${Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')}}`:JSON.stringify(v)
const hash=v=>createHash('sha256').update(v).digest('hex')
const get=async url=>{for(let attempt=0;;attempt++){try{const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error(`Source failed (${response.status})`);return await response.json()}catch(error){if(attempt===3)throw error;await new Promise(resolve=>setTimeout(resolve,500*2**attempt))}}}
let datasetId
const rows=[]
// Pin first, then read independent collections concurrently, checking every page.
const initial=await get(base+'/organizations');datasetId=initial.datasetId
await Promise.all(collections.map(async collection=>{let after='';do{const url=new URL(base+'/'+collection);url.searchParams.set('datasetId',datasetId);if(after)url.searchParams.set('after',after);const page=await get(url);if(page.datasetId!==datasetId||!Array.isArray(page.records))throw Error('Changed public dataset');for(const r of page.records){if(hash(canonical(r.value))!==r.sha256)throw Error('Source checksum mismatch');rows.push({collection,...r})}if(page.next!==null&&(typeof page.next!=='string'||page.next<=after))throw Error('Invalid source cursor');after=page.next}while(after!==null)}))
const digest=rows=>hash([...rows].sort((a,b)=>(a.collection+'\t'+a.key)<(b.collection+'\t'+b.key)?-1:1).map(r=>`${r.collection}\t${r.key}\t${r.sha256}\n`).join(''))
if(digest(rows)!==datasetId)throw Error('Incomplete public dataset')
const agencies=JSON.parse(await readFile(new URL('./maryland-government-agencies.json',import.meta.url),'utf8'))
const url=new URL(apiUrl);url.searchParams.set('$where','fiscal_year=2027');url.searchParams.set('$limit','5000');url.searchParams.set('$order','agency_code,organization_code,fund_type_name,fund_source_code')
const sourceRows=await get(url)
const countUrl=new URL(apiUrl);countUrl.searchParams.set('$where','fiscal_year=2027');countUrl.searchParams.set('$select','count(*) AS count,sum(budget) AS total')
const [count]=await get(countUrl)
if(sourceRows.length!==Number(count.count)||sourceRows.reduce((n,r)=>n+Number(r.budget),0)!==Number(count.total))throw Error('Incomplete budget source')
const dhcd=sourceRows.filter(r=>r.agency_code==='S00');if(dhcd.length!==117||dhcd.reduce((n,r)=>n+Number(r.budget),0)!==902223261)throw Error('DHCD reconciliation changed')
const projection=projectMarylandGovernment(sourceRows,rows.filter(r=>r.collection==='organizations').map(r=>r.value),agencies)
// Replace only the explicitly reviewed DBM projection; preserve all other evidence.
const replaced=new Set(projection.relationships.map(r=>r.id)),orgs=new Set(projection.organizations.map(o=>o.id))
const preserved=rows.filter(r=>!(r.collection==='relationships'&&replaced.has(r.value.id))&&!(r.collection==='organizations'&&orgs.has(r.value.id))&&!(r.collection==='metadata'&&r.value.id==='data:marylandBudgetCoverage'))
const referenced=new Set([...preserved.filter(r=>r.collection==='relationships').map(r=>r.value),...projection.relationships].flatMap(r=>[r.source,r.target]))
const retained=preserved.filter(r=>!(r.collection==='organizations'&&r.value.entityType==='budget_fund'&&r.value.id.startsWith('md-budget-fund:')&&!referenced.has(r.value.id)))
function add(collection,value){const key=hash(value.id),sha256=hash(canonical(value));if(retained.some(r=>r.collection===collection&&r.key===key))throw Error('Conflicting source key');retained.push({collection,key,value,sha256})}
for(const collection of ['organizations','relationships'])for(const value of projection[collection])add(collection,value)
add('metadata',{id:'data:marylandBudgetCoverage',value:{fiscalYear:2027,budgetStatus:'legislative_appropriation',stateOrganizationId:marylandId,agencies:agencies.length,departments:agencies.filter(a=>a.classification==='department').length,principalDepartments:agencies.filter(a=>a.principalDepartment).length,records:sourceRows.length,total:Number(count.total),currency:'USD',datasetUrl,statusSourceUrl,governmentSource,scope:'All FY2027 funding-source dataset agency entries, with departments, other agencies/offices and budget headings classified separately. Fund types are edge attributes, not organizations. This dataset is not a complete state cash-flow statement.',retrievedAt:new Date().toISOString(),sourceSha256:hash(canonical(sourceRows))}})
retained.sort((a,b)=>(a.collection+'\t'+a.key)<(b.collection+'\t'+b.key)?-1:1)
const out=resolve(values.out);await mkdir(resolve(out,'..'),{recursive:true,mode:0o700});await writeFile(out,JSON.stringify({datasetId:digest(retained),rows:retained})+'\n',{mode:0o600});await writeFile(out+'.source.json',JSON.stringify(sourceRows)+'\n',{mode:0o600})
console.log(JSON.stringify({previousDatasetId:datasetId,datasetId:digest(retained),records:retained.length,budgetRecords:sourceRows.length,agencies:agencies.length,budgetTotal:Number(count.total),out}))
