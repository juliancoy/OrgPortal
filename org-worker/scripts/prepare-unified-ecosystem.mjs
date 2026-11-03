// Offline bootstrap only: preserve the graph's existing evidence and metadata.
// After publication the DB export, not these archival files, feeds graph indexes.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {mergeNetworkHistory,appendNonprofitEvidence} from '../../web/src/features/ecosystem/network-history.js';
import {canonicalJson} from '../src/eventOperationStore.ts';
const root=resolve(process.argv[2]||'../web/public/ecosystem-data'),out=resolve(process.argv[3]||'../../.runtime/unified-ecosystem/bootstrap.json');
const read=async name=>JSON.parse(await readFile(resolve(root,name+'.json'),'utf8'));
const [base,history,events,nonprofit,performance,positions]=await Promise.all(['ecosystem-portal','ecosystem-relationships','ecosystem-history','ecosystem-nonprofits','ecosystem-performance','network-default-positions'].map(read));
const data=mergeNetworkHistory(base,appendNonprofitEvidence(history,nonprofit));
data.events=mergeNetworkHistory({...data,relationships:[],financing:[]},{...events,relationships:[],financing:[]}).events||[];
const hash=value=>createHash('sha256').update(value).digest('hex'),rows=[],seen=new Map();
function add(collection,id,value){
 const key=hash(String(id)),sha256=hash(canonicalJson(value)),identity=collection+':'+key;
 if(seen.has(identity)){if(seen.get(identity)!==sha256)throw Error('Conflicting source record '+identity);return;}
 if(Buffer.byteLength(canonicalJson(value))>60000)throw Error('Oversized source record '+identity);
 seen.set(identity,sha256);rows.push({collection,key,value,sha256});
}
for(const collection of ['organizations','relationships','financing','events','nonprofitProfiles'])for(const value of data[collection]||[])add(collection,value.id||value.ein,value);
for(const value of performance.records||[])add('performanceRecords',value.awardKey,value);
for(const value of performance.assessments||[])add('performanceAssessments',value.awardKey,value);
for(const [id,value] of Object.entries(positions.organizations||{}))add('positions',id,{id,value});
const metadata={...data};for(const key of ['organizations','relationships','financing','events','nonprofitProfiles'])delete metadata[key];
for(const [id,value] of Object.entries(metadata))add('metadata','data:'+id,{id:'data:'+id,value});
for(const [id,value] of Object.entries(performance))if(!['records','assessments'].includes(id))add('metadata','performance:'+id,{id:'performance:'+id,value});
for(const [id,value] of Object.entries(positions))if(id!=='organizations')add('metadata','positions:'+id,{id:'positions:'+id,value});
rows.sort((a,b)=>(a.collection+'\t'+a.key)<(b.collection+'\t'+b.key)?-1:1);
const datasetId=hash(rows.map(r=>`${r.collection}\t${r.key}\t${r.sha256}\n`).join(''));
await mkdir(resolve(out,'..'),{recursive:true,mode:0o700});await writeFile(out,JSON.stringify({datasetId,rows})+'\n',{mode:0o600});
console.log(JSON.stringify({datasetId,records:rows.length,counts:Object.fromEntries([...new Set(rows.map(r=>r.collection))].map(c=>[c,rows.filter(r=>r.collection===c).length])),out}));
