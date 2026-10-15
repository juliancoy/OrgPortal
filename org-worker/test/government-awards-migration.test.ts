import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

test('government obligations retain unknown recipients and signed cent totals in the master view',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  db.exec('PRAGMA foreign_keys=ON');
  const directory=new URL('../migrations/',import.meta.url);
  for(const name of readdirSync(directory).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL(name,directory),'utf8'));
  const insert=db.prepare(`INSERT INTO government_award_records(id,award_identifier,agency_label,recipient_label,recipient_identity,amount_cents,occurred_at,retrieved_at,period_start,period_end,source_url,description,notes,provenance_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for(const [id,cents] of [['award-a',12345],['award-b',-2345]] as const)insert.run(id,id,'Agency','Redacted','unidentified',cents,'2025-01-01','2026-10-14','2024-10-01','2025-09-30','https://www.usaspending.gov/award/'+id,'Grant','Not payment','{}');
  const rows=db.prepare("SELECT * FROM master_transaction_records WHERE record_type='government_award' ORDER BY id").all();
  assert.equal(rows.length,2);assert.equal(rows[0].to_organization_id,null);assert.equal(rows[0].to_label,'Redacted');
  assert.equal(rows[0].financial_fact_type,'obligation');assert.equal(rows[0].financial_measurement,'cumulative');assert.equal(rows[0].status,'reported');
  const total=db.prepare('SELECT * FROM government_award_summary').get()!;
  assert.equal(total.record_count,2);assert.equal(total.net_obligations_usd,100);assert.equal(total.positive_obligations_usd,123.45);assert.equal(total.negative_obligations_usd,-23.45);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close()}
});
