import importlib.util
from pathlib import Path
import unittest
import tempfile,json,csv,io,zipfile
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('collector',Path(__file__).with_name('collect-usaspending.py'))
collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)

def source(**changes):
    return dict(contract_transaction_unique_key='CONT_TX_001',contract_award_unique_key='CONT_AWD_001',
                action_date='2024-10-01',federal_action_obligation='-123.45',awarding_agency_name='Federal agency',
                recipient_name='Reported recipient',recipient_state_code='MD',recipient_country_code='USA',
                primary_place_of_performance_state_code='VA',primary_place_of_performance_country_code='USA',
                usaspending_permalink='https://www.usaspending.gov/award/CONT_AWD_001/',**changes)

class CollectorTests(unittest.TestCase):
    def normalize(self,row):return collector.normalize(row,'2026-11-23T00:00:00Z','a'*64)
    def test_exact_cents_federal_year_identity_and_privacy(self):
        row=self.normalize(source(recipient_address_line_1='DO NOT RETAIN'))
        self.assertEqual(row['amount_cents'],-12345)
        self.assertEqual(row['metadata']['fiscal_year'],'2025')
        self.assertEqual(row['fact_type'],'obligation')
        self.assertNotIn('DO NOT RETAIN',str(row))
        again=self.normalize(source())
        self.assertEqual(row,again)
        changed=source();changed['modification_number']='1';changed['contract_transaction_unique_key']='CONT_TX_002'
        self.assertNotEqual(row['id'],self.normalize(changed)['id'])
    def test_both_geographies_and_both_record_families(self):
        row=source();row['recipient_state_code']='DC';row['primary_place_of_performance_state_code']='MD'
        row['assistance_transaction_unique_key']=row.pop('contract_transaction_unique_key')
        row['assistance_award_unique_key']=row.pop('contract_award_unique_key')
        self.assertEqual(self.normalize(row)['metadata']['recipient_state_code'],'DC')
        del row['primary_place_of_performance_state_code']
        row['primary_place_of_performance_state_name']='MARYLAND'
        self.assertEqual(self.normalize(row)['metadata']['primary_place_of_performance_state_code'],'MD')
        self.assertEqual(self.normalize(row)['metadata']['primary_place_of_performance_state_name'],'MARYLAND')
        row['primary_place_of_performance_state_name']='MD'
        self.assertEqual(self.normalize(row)['metadata']['primary_place_of_performance_state_code'],'MD')
        row['primary_place_of_performance_state_name']='VIRGINIA'
        with self.assertRaises(ValueError):self.normalize(row)
    def test_unnamed_agency_preserves_reported_code_without_guessing_identity(self):
        row=source();row['awarding_agency_name']='';row['awarding_agency_code']='999'
        result=self.normalize(row)
        self.assertEqual(result['agency_label'],'Federal agency 999 (name not supplied)')
        self.assertEqual(result['metadata']['awarding_agency_name'],'')
        self.assertEqual(result['metadata']['awarding_agency_code'],'999')
    def test_unnamed_recipient_retains_funding_with_explicit_missing_label(self):
        raw=source();raw['recipient_name']='';raw['recipient_uei']='ABCD12345678'
        row=self.normalize(raw);self.assertEqual(row['recipient_label'],'Recipient not reported (ABCD12345678)')
        self.assertEqual(row['metadata']['recipient_uei'],'ABCD12345678');self.assertEqual(row['amount_cents'],-12345)
        raw['recipient_uei']='';self.assertIn('CONT_AWD_001',self.normalize(raw)['recipient_label'])
    def test_recipient_scope_must_be_explicit_and_keeps_native_identity(self):
        row=source();row['recipient_state_code']='VA'
        with self.assertRaises(ValueError):self.normalize(row)
        unrestricted=collector.normalize(row,'2026-11-23T00:00:00Z','a'*64,require_maryland=False)
        self.assertEqual(unrestricted['id'],self.normalize(source())['id'])
        self.assertEqual(unrestricted['metadata']['recipient_state_code'],'VA')
        self.assertEqual(unrestricted['fact_type'],'obligation')
    def test_missing_or_fractional_cents_and_unofficial_sources_stop_collection(self):
        for amount in ['', 'NaN', '0.001', '90071992547409.92']:
            row=source();row['federal_action_obligation']=amount
            with self.assertRaises(Exception):self.normalize(row)
        for url in ['http://www.usaspending.gov/award/a','https://www.usaspending.gov.evil.test/award/a','https://user@www.usaspending.gov/award/a']:
            row=source();row['usaspending_permalink']=url
            with self.assertRaises(ValueError):self.normalize(row)
        row=source();row['contract_transaction_unique_key']=''
        with self.assertRaises(ValueError):self.normalize(row)

    def test_quarantine_preserves_rejected_evidence_and_reconciles_without_importing_it(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(collector.FAMILIES, {'contracts':collector.FAMILIES['contracts']}, clear=True):
            out=Path(directory);bad=source();bad['recipient_state_code']='VA';bad['contract_transaction_unique_key']='OUTSIDE'
            for scope in ['place_of_performance','recipient']:
                prefix='fy2025-'+scope+'-contracts'
                codes,columns=collector.FAMILIES['contracts']
                filters={'award_type_codes':codes,'time_period':[{'start_date':'2024-10-01','end_date':'2025-09-30'}],scope+'_locations':[{'country':'USA','state':'MD'}]}
                payload={'filters':filters,'columns':collector.COMMON_COLUMNS+columns,'spending_level':['transactions'],'file_format':'csv'}
                (out/(prefix+'-request.json')).write_text(json.dumps({'request':payload,'requestedAt':'2026-11-24T00:00:00Z','expectedCount':2}))
                (out/(prefix+'-status.json')).write_text(json.dumps({'status':'finished','total_rows':2}))
                buf=io.StringIO();writer=csv.DictWriter(buf,fieldnames=list(source()));writer.writeheader();writer.writerows([source(),bad])
                with zipfile.ZipFile(out/(prefix+'.zip'),'w') as z:z.writestr('transactions.csv',buf.getvalue())
            with self.assertRaisesRegex(ValueError,'outside Maryland'):collector.collect(out,[2025])
            collector.collect(out,[2025],quarantine_invalid=True)
            manifest=json.loads((out/'manifest.json').read_text())
            self.assertEqual(manifest['records'],1)
            self.assertEqual([r['quarantinedRecords'] for r in manifest['sources']],[1,1])
            self.assertEqual([r['normalizedRecords'] for r in manifest['sources']],[1,1])
            self.assertEqual(manifest['sources'][1]['duplicates'],1)
            review=[json.loads(line) for line in (out/'quarantine.jsonl').read_text().splitlines()]
            self.assertEqual(len(review),2);self.assertEqual(review[0]['row']['contract_transaction_unique_key'],'OUTSIDE')
            self.assertEqual(review[0]['rowNumber'],2);self.assertEqual(len(review[0]['sourceSha256']),64)
            self.assertNotIn('OUTSIDE',(out/'observations.jsonl').read_text())

if __name__=='__main__':unittest.main()
