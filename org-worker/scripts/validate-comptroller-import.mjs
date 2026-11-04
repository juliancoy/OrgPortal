// Offline verification only; no production connection or credentials.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {comptrollerImportSchema} from '../src/marylandComptroller.ts';
const root=new URL('../../artifacts/maryland-comptroller/',import.meta.url);
const migrationDir=new URL('../migrations/',import.meta.url);
const bytes=readFileSync(new URL('observations.jsonl',root));
const rows=bytes.toString().trim().split('\n').map(line=>JSON.parse(line));
const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
if(manifest.failures.length||manifest.bpw_only||rows.length!==manifest.record_count)throw Error('Source collection is incomplete');
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
try {
 for(const file of readdirSync(migrationDir).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL(file,migrationDir),'utf8'));
 const before=Number(db.prepare('SELECT count(*) n FROM master_transaction_records').get().n);
 const ledger=JSON.stringify(db.prepare('SELECT * FROM ledger_transactions ORDER BY id').all());
 const columns=['id','source_system','currency','measurement','notes','dataset','external_id','agency_label','recipient_label','occurred_at','amount_cents','fact_type','description','source_url','metadata_json','retrieved_at','source_sha256'];
 const insert=db.prepare(`INSERT INTO external_financial_observations(${columns}) VALUES(${columns.map(()=>'?')}) ON CONFLICT(id) DO NOTHING`);
 for(let offset=0;offset<rows.length;offset+=50)comptrollerImportSchema.parse({organizationId:'review-only',rows:rows.slice(offset,offset+50)});
 for(const row of rows)Object.assign(row,{source_system:'maryland_comptroller',currency:'USD',measurement:'delta',notes:row.dataset==='bpw' ? 'Approval observation; may amend another award or name multiple recipients. Negative amounts indicate revenue. Do not sum with payments.' : 'Reported disbursed payment total; not internal ledger settlement or invoice allocation.'});
 const expected=new Map();
 for(const r of rows){
  if(!Number.isSafeInteger(r.amount_cents)||!r.source_sha256)throw Error('Invalid amount or missing source checksum');
  expected.set(r.dataset,(expected.get(r.dataset)||0n)+BigInt(r.amount_cents));
 }
 for(let run=0;run<2;run++){
  db.exec('BEGIN');
  try{for(const r of rows)insert.run(...columns.map(k=>k==='metadata_json'?JSON.stringify(Object.fromEntries(Object.entries(r.metadata).sort(([a],[b])=>a.localeCompare(b)))):r[k]));db.exec('COMMIT');}
  catch(error){db.exec('ROLLBACK');throw error;}
 }
 const counts=db.prepare('SELECT dataset,count(*) n,sum(amount_cents) cents,min(occurred_at) start,max(occurred_at) end FROM external_financial_observations GROUP BY dataset').all();
 for(const c of counts)if(BigInt(c.cents)!==expected.get(c.dataset))throw Error('Signed cent reconciliation failed');
 if(Number(db.prepare('SELECT count(*) n FROM external_financial_observations').get().n)!==rows.length)throw Error('Identity reconciliation failed');
 if(Number(db.prepare('SELECT count(*) n FROM master_transaction_records').get().n)!==before+rows.length)throw Error('Master transaction projection mismatch');
 if(JSON.stringify(db.prepare('SELECT * FROM ledger_transactions ORDER BY id').all())!==ledger)throw Error('Ledger changed');
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key failure');
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Integrity failure');
 const report={productionApplied:false,observationsSha256:createHash('sha256').update(bytes).digest('hex'),records:rows.length,counts,validation:['full migration chain','two identical imports','exact signed cent totals','master transaction projection','existing transaction preservation','unchanged internal ledger','foreign keys','database integrity']};
 writeFileSync(new URL('validation.json',root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{db.close();}
