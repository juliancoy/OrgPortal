import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
test('nonprofit statements remain separate from grants and amended periods do not double count',()=>{
 const db=new DatabaseSync(':memory:');try{
  const directory=new URL('../migrations/',import.meta.url);db.exec('PRAGMA foreign_keys=ON');
  for(const name of readdirSync(directory).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL(name,directory),'utf8'));
  const filing=db.prepare(`INSERT INTO nonprofit_filing_records(id,ein,name,form_type,period_start,period_end,filed_at,amended,selected,accounting_basis,revenue_cents,source_url,archive_url,source_sha256,retrieved_at) VALUES(?,?,?,'990PF','2024-01-01','2024-12-31',?, ?,?,'accrual',100000, 'https://example.test/filing','https://apps.irs.gov/archive.zip','checksum','2026-10-14')`);
  filing.run('original','012345678','Foundation','2025-01-01',0,1);
  const grant=db.prepare(`INSERT INTO nonprofit_grant_records(id,filing_id,recipient_name,recipient_identity,amount_cents,kind,grant_status,source_url,description,notes,provenance_json) VALUES(?,?,'Redacted','unidentified',?,?,?,'https://example.test/filing','Grant','Reported, not bank verified','{}')`);
  grant.run('old','original',10000,'transfer','paid');grant.run('future','original',20000,'terms','approved_future');
  assert.equal(db.prepare("SELECT count(*) n FROM master_transaction_records WHERE record_type='nonprofit_grant'").get()!.n,2);
  assert.equal(db.prepare("SELECT sum(amount) n FROM master_transaction_records WHERE record_type='nonprofit_grant' AND transaction_type='transfer'").get()!.n,100);
  db.exec("UPDATE nonprofit_filing_records SET selected=0 WHERE id='original'");
  filing.run('amended','012345678','Foundation','2025-02-01',1,1);grant.run('revised','amended',12000,'transfer','paid');
  const rows=db.prepare("SELECT * FROM master_transaction_records WHERE record_type='nonprofit_grant'").all();
  assert.equal(rows.length,1);assert.equal(rows[0].amount,120);assert.equal(rows[0].to_organization_id,null);assert.equal(rows[0].status,'reported');
  assert.equal(rows[0].financial_measurement,'period_total');assert.equal(db.prepare('SELECT count(*) n FROM nonprofit_grant_records').get()!.n,3);
  assert.throws(()=>db.exec("UPDATE nonprofit_filing_records SET source_sha256='changed' WHERE id='amended'"),/checksum changed/);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close()}
});
