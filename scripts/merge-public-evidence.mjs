// Prepare a new version without overwriting any preserved public source row.
// The import client separately verifies that parentDatasetId is still active.
import {readFile,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {once} from 'node:events';
import {basename} from 'node:path';
import {createHash} from 'node:crypto';
import {canonicalJson} from '../org-worker/src/eventOperationStore.ts';
const [baselinePath,baselineSha,additionsPath,additionsSha,output]=process.argv.slice(2);
if(!output)throw Error('Supply baseline file/SHA256, additions file/SHA256, output file');
const hash=value=>createHash('sha256').update(value).digest('hex');
async function verified(path,expected){const bytes=await readFile(path);if(hash(bytes)!==expected)throw Error('Input checksum mismatch');return JSON.parse(bytes);}
const baseline=await verified(baselinePath,baselineSha),additions=await verified(additionsPath,additionsSha);
const rows=[...baseline.rows];const compare=(a,b)=>(a.collection+'\t'+a.key)<(b.collection+'\t'+b.key)?-1:1;
const digest=()=>hash(rows.map(row=>`${row.collection}\t${row.key}\t${row.sha256}\n`).join(''));
for(const row of rows)if(hash(canonicalJson(row.value))!==row.sha256)throw Error('Baseline source checksum mismatch');
rows.sort(compare);if(digest()!==baseline.datasetId)throw Error('Baseline dataset digest mismatch');
const keys=new Map(rows.map(row=>[row.collection+':'+row.key,row]));if(keys.size!==rows.length)throw Error('Duplicate baseline source keys');
const organizations=new Map(rows.filter(row=>row.collection==='organizations').map(row=>[row.value.id,row.value]));const reused=[];let added=0;
for(const [collection,values] of Object.entries(additions)){
 if(!['organizations','relationships','metadata','nonprofitProfiles'].includes(collection))throw Error('Unreviewed evidence collection');
 for(const value of values){
  if(!value.id)throw Error('Stable source ID required');
  if(collection==='organizations'&&organizations.has(value.id)){
   // Exact source IDs reuse existing graph nodes. Differing source labels stay
   // on each transaction; this makes no fuzzy association or identity change.
   reused.push({id:value.id,existingName:organizations.get(value.id).name,sourceName:value.name});continue;
  }
  const key=hash(value.id),sha256=hash(canonicalJson(value)),prior=keys.get(collection+':'+key);
  if(prior){if(prior.sha256!==sha256)throw Error('Conflicting source record '+value.id);continue;}
  const row={collection,key,value,sha256};rows.push(row);keys.set(collection+':'+key,row);added++;
  if(collection==='organizations')organizations.set(value.id,value);
 }
}
for(const row of rows)if(row.collection==='relationships'&&(additions.relationships||[]).length&&row.value.sourceSystem==='usaspending'&&row.value.sourceDataset==='subawards'){
 for(const endpoint of [row.value.source,row.value.target])if(!organizations.has(endpoint))throw Error('Unknown subaward endpoint '+endpoint);
 if(row.value.annualAmountEligible!==false||row.value.financialMeasure!=='snapshot')throw Error('Subaward reports must remain non-additive');
}
rows.sort(compare);const datasetId=digest(),rowsPath=output+'.rows.jsonl';const stream=createWriteStream(rowsPath,{mode:0o600}),rowsHash=createHash('sha256');
for(const row of rows){const line=JSON.stringify(row)+'\n';rowsHash.update(line);if(!stream.write(line))await once(stream,'drain');}
stream.end();await once(stream,'finish');
const bytes=JSON.stringify({datasetId,parentDatasetId:baseline.datasetId,rowsFile:basename(rowsPath),rowCount:rows.length,rowsSha256:rowsHash.digest('hex')})+'\n';
await writeFile(output,bytes,{mode:0o600});
const report={datasetId,parentDatasetId:baseline.datasetId,preserved:baseline.rows.length,added,records:rows.length,baselineSha,additionsSha,reusedSourceNodes:reused,fileSha256:hash(bytes)};
await writeFile(output+'.review.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({...report,reusedSourceNodes:reused.length}));
