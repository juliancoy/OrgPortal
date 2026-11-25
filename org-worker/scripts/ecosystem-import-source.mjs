import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {readJsonLines} from './json-lines.mjs';
import {dirname,resolve,basename} from 'node:path';
export async function readEcosystemImport(path,expectedSha256){
 const bytes=await readFile(path);if(createHash('sha256').update(bytes).digest('hex')!==expectedSha256)throw Error('Bootstrap file changed');
 const manifest=JSON.parse(bytes);let rows=manifest.rows;
 if(manifest.rowsFile){
  if(rows||basename(manifest.rowsFile)!==manifest.rowsFile)throw Error('Invalid row manifest');
  const file=resolve(dirname(path),manifest.rowsFile);const hash=createHash('sha256');
  for await(const chunk of createReadStream(file))hash.update(chunk);
  if(hash.digest('hex')!==manifest.rowsSha256)throw Error('Dataset rows file changed');
  rows=[];for await(const row of readJsonLines(file))rows.push(row);
  if(rows.length!==manifest.rowCount)throw Error('Dataset row count differs');
 }
 if(!Array.isArray(rows))throw Error('Missing dataset rows');
 const hash=createHash('sha256');let previous='';
 for(const row of rows){const key=row.collection+'\t'+row.key;if(key<=previous)throw Error('Unsorted or duplicate dataset keys');previous=key;hash.update(`${key}\t${row.sha256}\n`);}
 if(hash.digest('hex')!==manifest.datasetId)throw Error('Dataset digest differs');
 return {...manifest,rows};
}
