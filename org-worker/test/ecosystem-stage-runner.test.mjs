import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {stageBatches} from '../scripts/ecosystem-stage-runner.mjs';
test('bounded concurrent staging resumes a lost apply reply without replay',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ecosystem-stage-'));
 try{
  const rows=Array.from({length:501},(_,i)=>({id:String(i)}));let active=0,peak=0,lost=true;
  const applied=new Map(),previews=new Map();let calls=0;
  const call=async(name,payload)=>{
   calls++;
   if(name==='get_ecosystem_dataset_status')return {status:applied.has(payload.previewId)?'completed':'prepared'};
   if(name==='preview_ecosystem_dataset'){const previewId=payload.rows[0].id;previews.set(previewId,payload.rows);return {previewId,records:payload.rows.length};}
   active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;
   assert(!applied.has(payload.previewId),'must not replay an acknowledged source batch');
   applied.set(payload.previewId,payload.rows);
   if(lost&&payload.previewId==='0'){lost=false;throw Error('reply lost after server commit');}
   return {recorded:payload.rows.length,existing:0};
  };
  const options={rows,offset:0,datasetId:'dataset',organizationId:'org',directory,concurrency:3,call};
  await assert.rejects(stageBatches(options),/reply lost/);
  assert.equal(await stageBatches(options),501);
  assert.equal(peak,3);assert.equal([...applied.values()].flat().length,501);
  assert.equal((await readdir(directory)).length,3);
  assert.equal(JSON.parse(await readFile(join(directory,'0.json'))).recovered,true);
  const before=calls;await stageBatches(options);assert.equal(calls,before);
  await assert.rejects(stageBatches({...options,rows:[{id:'changed'},...rows.slice(1)]}),/receipt does not match/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('an ambiguous pending receipt stops without reapplying or publishing',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ecosystem-stage-'));let applies=0;
 try{
  const call=async name=>{
   if(name==='preview_ecosystem_dataset')return {previewId:'pending',records:1};
   if(name==='get_ecosystem_dataset_status')return {status:'in_progress'};
   applies++;throw Error('unknown result');
  };
  const options={rows:[{id:'1'}],offset:0,datasetId:'dataset',organizationId:'org',directory,concurrency:1,call};
  await assert.rejects(stageBatches(options),/unknown result/);
  await assert.rejects(stageBatches(options),/inspect before replay/);
  assert.equal(applies,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('server-confirmed unclaimed receipt resumes the same preview, retaining expired previews',async()=>{
 for(const expired of [false,true]){
  const directory=await mkdtemp(join(tmpdir(),'ecosystem-prepared-'));let attempts=0,previews=0;const used=[];
  try{
   const call=async(name,payload)=>{
    if(name==='preview_ecosystem_dataset')return {previewId:'preview-'+(++previews),records:1};
    if(name==='get_ecosystem_dataset_status')return {status:'prepared',expires_at:expired?1:Date.now()+60000};
    used.push(payload.previewId);if(++attempts===1)throw Error('request did not reach claim');return {recorded:1,existing:0};
   };
   const options={rows:[{id:'1'}],offset:0,datasetId:'dataset',organizationId:'org',directory,concurrency:1,call};
   await assert.rejects(stageBatches(options),/did not reach/);assert.equal(await stageBatches(options),1);
   assert.deepEqual(used,expired?['preview-1','preview-2']:['preview-1','preview-1']);
   assert.equal(previews,expired?2:1);
   if(expired)assert.ok((await readdir(directory)).includes('0.json.expired-preview-1'));
  }finally{await rm(directory,{recursive:true,force:true});}
 }
});

test('uncertain staging reconciles source hashes, retains the old receipt and previews only a reviewed retry',async()=>{
 for(const mode of ['stored','missing','conflicting']){
  const directory=await mkdtemp(join(tmpdir(),'ecosystem-uncertain-'));let previews=0,applies=0;
  try{
   const rows=[{collection:'organizations',key:'k',sha256:'hash',value:{id:'1'}}];
   const call=async(name,payload)=>{
    if(name==='preview_ecosystem_dataset')return {previewId:'p'+(++previews),records:1};
    if(name==='get_ecosystem_dataset_status')return {status:'uncertain',...(payload.verifyRows?{rowVerification:{datasetId:'dataset',requested:1,matched:mode==='stored'?1:0,missing:mode==='missing'?1:0,conflicting:mode==='conflicting'?1:0}}:{})};
    if(++applies===1)throw Error('reply uncertain');return {recorded:1,existing:0};
   };
   const options={rows,offset:0,datasetId:'dataset',organizationId:'org',directory,concurrency:1,call};
   await assert.rejects(stageBatches(options),/reply uncertain/);
   if(mode==='conflicting'){await assert.rejects(stageBatches(options),/could not be reconciled/);assert.equal(applies,1);}
   else{
    assert.equal(await stageBatches(options),1);assert.equal(applies,mode==='stored'?1:2);assert.equal(previews,mode==='stored'?1:2);
    assert.ok((await readdir(directory)).includes('0.json.uncertain-p1'));
   }
  }finally{await rm(directory,{recursive:true,force:true});}
 }
});
