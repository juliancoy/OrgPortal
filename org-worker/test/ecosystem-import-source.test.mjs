import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readEcosystemImport} from '../scripts/ecosystem-import-source.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
test('streamed and inline datasets verify identical ordered rows; tampered files, counts and digests fail closed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ecosystem-source-'));try{
  const rows=[{collection:'organizations',key:'a'.repeat(64),sha256:'b'.repeat(64),value:{id:'test',name:'Unicode \u2028 and \u2029 separators stay inside the JSON record'}}];
  const datasetId=hash(rows.map(r=>`${r.collection}\t${r.key}\t${r.sha256}\n`).join(''));
  const path=join(dir,'manifest.json'),rowsPath=join(dir,'rows.jsonl'),lines=rows.map(row=>JSON.stringify(row)+'\n').join('');
  const save=async manifest=>{const text=JSON.stringify(manifest);await writeFile(path,text);return hash(text);};
  let digest=await save({datasetId,rows});assert.deepEqual((await readEcosystemImport(path,digest)).rows,rows);
  await assert.rejects(readEcosystemImport(path,'changed'),/Bootstrap file changed/);
  await writeFile(rowsPath,lines);const manifest={datasetId,rowsFile:'rows.jsonl',rowsSha256:hash(lines),rowCount:1};
  digest=await save(manifest);assert.deepEqual((await readEcosystemImport(path,digest)).rows,rows);
  for(const [patch,message] of [[{rowCount:2},/count differs/],[{datasetId:'c'.repeat(64)},/digest differs/],[{rowsFile:'../rows.jsonl'},/Invalid row manifest/]]){
   digest=await save({...manifest,...patch});await assert.rejects(readEcosystemImport(path,digest),message);
  }
  digest=await save(manifest);await writeFile(rowsPath,lines+'\n');await assert.rejects(readEcosystemImport(path,digest),/rows file changed/);
  digest=await save({datasetId,rows:[...rows,...rows]});await assert.rejects(readEcosystemImport(path,digest),/duplicate/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
