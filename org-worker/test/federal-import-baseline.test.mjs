import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {readBaseline,rowFingerprint,verifyBaselineSources} from '../scripts/federal-import-baseline.mjs';
test('baseline requires exact file checksum and unchanged source counts',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'federal-baseline-'));
 try{
  const row={id:'one',amount_cents:-123,metadata:{uei:'abc',fy:2025},source_sha256:'source'};
  const bytes=JSON.stringify(row)+'\n',path=join(directory,'rows.jsonl');await writeFile(path,bytes);
  const baseline=await readBaseline(path,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(baseline.rows.get('one'),rowFingerprint({metadata:{fy:2025,uei:'abc'},source_sha256:'source',amount_cents:-123,id:'one'}));
  assert.notEqual(baseline.rows.get('one'),rowFingerprint({...row,amount_cents:0}));
  verifyBaselineSources(baseline,{sources:[{source_sha256:'source',records:1},{source_sha256:'new-source',records:5}]});
  assert.throws(()=>verifyBaselineSources(baseline,{sources:[{source_sha256:'source',records:0}]}),/no longer matches/);
  await assert.rejects(readBaseline(path,'wrong'),/checksum mismatch/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
