"""Verify funding evidence distinctions and legacy public-feed compatibility."""
import sqlite3,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class FundingModel(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.execute('PRAGMA foreign_keys=ON')
  self.db.executescript('''
CREATE TABLE organizations(id TEXT PRIMARY KEY,name TEXT,slug TEXT);
CREATE TABLE ledger_accounts(id TEXT,name TEXT);
CREATE TABLE ledger_transactions(id TEXT,timestamp TEXT,transaction_type TEXT,amount REAL,currency TEXT,description TEXT,from_account_id TEXT,to_account_id TEXT);
CREATE TABLE financing_recipients(id TEXT,name TEXT,organization_id TEXT);
CREATE TABLE financing_events(id TEXT,recipient_id TEXT,agency_id TEXT,updated_at TEXT,occurred_at TEXT,event_type TEXT,amount REAL,currency TEXT,amount_qualifier TEXT,label TEXT,sources_json TEXT,notes TEXT,included_in_event_id TEXT,tags_json TEXT);
INSERT INTO organizations VALUES('agency','Agency','agency'),('recipient','Recipient','recipient');
''')
  self.db.executescript((ROOT/'migrations/0057_organization_support.sql').read_text())
  self.db.executescript((ROOT/'migrations/0075_funding_fact_model.sql').read_text())
  self.db.execute("INSERT INTO organization_support_records(id,from_organization_id,to_organization_id,from_label,to_label,support_kind,amount,currency,description,source_url,created_at) VALUES('award','agency','recipient','Agency','Recipient','transfer',100,'USD','Reported award','https://example.org','2026-10-06')")
 def fact(self,id='f',kind='reported_award',amount=100,linked='award',measurement='cumulative',supersedes=None):
  self.db.execute('INSERT INTO funding_facts(id,support_record_id,fact_type,scope,amount,currency,measurement,source_url,evidence,reviewed_at,supersedes_fact_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)',(id,linked,kind,'award',amount,'USD' if amount is not None else None,measurement,'https://example.org','Evidence','2026-10-06',supersedes))
 def test_public_feed_preserves_legacy_columns_and_adds_classification(self):
  self.fact();r=self.db.execute("SELECT record_id,amount,status,financial_fact_type,financial_measurement FROM master_transaction_records WHERE record_id='award'").fetchone()
  self.assertEqual(r,('award',100,'reported','reported_award','cumulative'))
 def test_award_is_neither_obligation_nor_payment(self):
  self.fact();self.assertEqual(self.db.execute('SELECT COUNT(*) FROM funding_reported_awards').fetchone()[0],1)
  for view in ('funding_obligations','funding_disbursements'):self.assertEqual(self.db.execute('SELECT COUNT(*) FROM '+view).fetchone()[0],0)
 def test_linked_amount_must_match_and_cannot_be_silently_changed(self):
  with self.assertRaises(sqlite3.IntegrityError):self.fact(amount=90)
  self.fact()
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE organization_support_records SET amount=90 WHERE id='award'")
 def test_zero_balance_and_negative_obligation_correction_are_supported(self):
  self.fact(id='balance',kind='balance',amount=0,linked=None,measurement='snapshot');self.fact(id='correction',kind='obligation',amount=-10,linked=None,measurement='delta')
  self.assertEqual(self.db.execute('SELECT amount FROM funding_balances').fetchone()[0],0)
 def test_negative_appropriation_and_monetary_administration_rejected(self):
  with self.assertRaises(sqlite3.IntegrityError):self.fact(kind='appropriation',amount=-5,linked=None)
  with self.assertRaises(sqlite3.IntegrityError):self.fact(kind='administration',linked=None)
 def test_superseding_snapshot_and_voided_support_are_excluded(self):
  self.fact();self.fact(id='replacement',amount=120,linked=None,supersedes='f');self.assertEqual(self.db.execute('SELECT id FROM current_funding_facts').fetchall(),[('replacement',)])
  self.db.execute("UPDATE organization_support_records SET status='voided' WHERE id='award'");self.assertEqual(self.db.execute("SELECT count(*) FROM current_funding_facts WHERE id='f'").fetchone()[0],0)
 def test_foreign_keys_and_identical_award_identifiers_enforced(self):
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO funding_entities VALUES('missing','agency',NULL,NULL,NULL,'https://example.org','Evidence','2026-10-06')")
  for id in ('first','duplicate'):
   stmt="INSERT INTO funding_awards(id,awarding_agency_id,award_identifier,source_url,evidence) VALUES(?, 'agency','FAIN-123','https://example.org','Evidence')"
   if id=='first':self.db.execute(stmt,(id,))
   else:
    with self.assertRaises(sqlite3.IntegrityError):self.db.execute(stmt,(id,))
 def test_reconciliation_cycles_are_rejected(self):
  self.fact(id='first',linked=None);self.fact(id='second',linked=None,supersedes='first')
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE funding_facts SET supersedes_fact_id='second' WHERE id='first'")
  self.db.execute("UPDATE funding_facts SET included_in_fact_id='first' WHERE id='second'")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE funding_facts SET included_in_fact_id='second' WHERE id='first'")
 def test_agencies_are_not_accepted_as_programs_or_funds(self):
  self.db.execute("INSERT INTO funding_entities VALUES('agency','agency',NULL,'agency',NULL,'https://example.org','Agency','2026-10-06')")
  self.fact()
  for field in ('program_organization_id','fund_organization_id','account_organization_id'):
   with self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE funding_facts SET '+field+"='agency' WHERE id='f'")
if __name__=='__main__':unittest.main()
