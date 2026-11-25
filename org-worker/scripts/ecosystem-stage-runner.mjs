// Independent, disjoint stage batches have separate durable receipts. Publication
// remains sequential and requires the server's full dataset checksum to match.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export async function stageBatches({rows,offset,datasetId,organizationId,directory,concurrency,call,onProgress=()=>{}}){
 await mkdir(directory,{recursive:true,mode:0o700});
 const tasks=[];
 for(let i=offset;i<rows.length;){const start=i,batch=[];let bytes=0;
  while(i<rows.length&&batch.length<200){const size=Buffer.byteLength(JSON.stringify(rows[i]));if(batch.length&&bytes+size>450000)break;batch.push(rows[i++]);bytes+=size;}
  tasks.push({start,batch});
 }
 let next=0,completed=offset,failure;
 const save=async(path,value)=>{await writeFile(path+'.tmp',JSON.stringify(value)+'\n',{mode:0o600});await rename(path+'.tmp',path);};
 async function task({start,batch}){
  const payload={organizationId,datasetId,action:'stage',rows:batch};
  const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const path=join(directory,String(start)+'.json');let receipt;
  try{receipt=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(receipt&&receipt.hash!==hash)throw Error('Stage receipt does not match reviewed batch');
  if(receipt&&!receipt.completed){
   const status=await call('get_ecosystem_dataset_status',{organizationId,datasetId,previewId:receipt.previewId});
   if(status.status==='uncertain'){
    const verified=await call('get_ecosystem_dataset_status',{organizationId,datasetId,previewId:receipt.previewId,verifyRows:batch.map(({collection,key,sha256})=>({collection,key,sha256}))});
    const check=verified.rowVerification;
    if(verified.status!=='uncertain'||check?.datasetId!==datasetId||check.requested!==batch.length||check.conflicting||check.matched+check.missing!==batch.length)throw Error('Uncertain stage rows could not be reconciled; inspect before replay');
    await save(path+'.uncertain-'+receipt.previewId,{...receipt,verification:verified});
    if(check.matched===batch.length){receipt={...receipt,completed:true,recovered:true,verification:verified};await save(path,receipt);}
    else receipt=null; // New exact preview inserts only verified missing immutable rows.
   }else if(!['completed','prepared'].includes(status.status))throw Error(`Prior stage receipt is ${status.status}; inspect before replay`);
   if(status.status==='completed'){receipt={...receipt,completed:true,recovered:true};await save(path,receipt);}
   else if(status.status==='prepared'&&Number(status.expires_at)<=Date.now()){
    // The server confirms the one-use operation was never claimed. Retain its
    // receipt before requesting a fresh preview for the identical reviewed rows.
    await save(path+'.expired-'+receipt.previewId,receipt);receipt=null;
   }
  }
  if(!receipt){
   const preview=await call('preview_ecosystem_dataset',payload);
   if(!preview.previewId||preview.records!==batch.length)throw Error('Unexpected stage preview');
   receipt={hash,datasetId,start,count:batch.length,previewId:preview.previewId,completed:false};await save(path,receipt);
  }
  if(!receipt.completed){
   const result=await call('apply_ecosystem_dataset',{...payload,confirm:true,previewId:receipt.previewId});
   if(result.recorded+result.existing!==batch.length)throw Error('Unexpected stage apply count');
   receipt={...receipt,completed:true,result};await save(path,receipt);
  }
  completed+=batch.length;onProgress(completed);
 }
 await Promise.all(Array.from({length:concurrency},async()=>{while(next<tasks.length&&!failure){const current=tasks[next++];try{await task(current);}catch(error){failure??=error;}}}));
 if(failure)throw failure;
 return completed;
}
