// Validate a complete source file before the first production mutation.
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
import {writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {usaspendingImportSchema} from '../src/usaspending.ts';
const {values}=parseArgs({options:{file:{type:'string'},report:{type:'string'}}});
if(!values.file||!values.report)throw Error('Supply --file and a private --report path');
const hash=createHash('sha256');for await(const bytes of createReadStream(values.file))hash.update(bytes);
const totals={},sources={},labels=new Set();let records=0,last='',batch=[];
const validate=()=>{const result=usaspendingImportSchema.safeParse({organizationId:'validation-only',rows:batch});if(!result.success)throw Error('Source schema failure near row '+records+': '+JSON.stringify(result.error.issues.map(({path,message})=>({path,message}))));batch=[];};
for await(const line of createInterface({input:createReadStream(values.file),crlfDelay:Infinity})){
 if(!line.trim())continue;const row=JSON.parse(line);records++;
 if(row.id<=last||row.id!=='usaspending:transaction:'+createHash('sha256').update(row.external_id).digest('hex'))throw Error('Unstable or duplicate source ID at row '+records);
 last=row.id;batch.push(row);if(batch.length===1000)validate();
 const total=totals[row.metadata.fiscal_year]??={records:0,amount_cents:0};total.records++;total.amount_cents+=row.amount_cents;
 if(!Number.isSafeInteger(total.amount_cents))throw Error('Unsafe fiscal sum');
 sources[row.source_sha256]=(sources[row.source_sha256]||0)+1;labels.add(row.recipient_label);
}
if(batch.length)validate();
const report={validatedAt:new Date().toISOString(),sha256:hash.digest('hex'),records,totals,sources,recipientLabels:labels.size,productionApplied:false};
await writeFile(values.report,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
