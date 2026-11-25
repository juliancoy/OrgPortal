import {createReadStream} from 'node:fs';
import {readJsonLines} from './json-lines.mjs';
import {createHash} from 'node:crypto';
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
export const rowFingerprint=row=>createHash('sha256').update(JSON.stringify(stable(row))).digest('hex');
export async function readBaseline(path,expectedSha256){
 const hash=createHash('sha256');for await(const bytes of createReadStream(path))hash.update(bytes);
 const digest=hash.digest('hex');if(digest!==expectedSha256)throw Error('Baseline checksum mismatch');
 const rows=new Map(),sources=new Map();
 for await(const row of readJsonLines(path)){
  if(rows.has(row.id))throw Error('Duplicate baseline ID');rows.set(row.id,rowFingerprint(row));
  sources.set(row.source_sha256,(sources.get(row.source_sha256)||0)+1);
 }
 return {digest,rows,sources};
}
export function verifyBaselineSources(baseline,status){
 const actual=new Map(status.sources.map(r=>[r.source_sha256,Number(r.records)]));
 for(const [sha,count] of baseline.sources)if(actual.get(sha)!==count)throw Error('Production no longer matches the reviewed baseline source counts');
}
