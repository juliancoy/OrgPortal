import importlib.util
from pathlib import Path
import unittest

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
        row['primary_place_of_performance_state_name']='VIRGINIA'
        with self.assertRaises(ValueError):self.normalize(row)
    def test_unnamed_agency_preserves_reported_code_without_guessing_identity(self):
        row=source();row['awarding_agency_name']='';row['awarding_agency_code']='999'
        result=self.normalize(row)
        self.assertEqual(result['agency_label'],'Federal agency 999 (name not supplied)')
        self.assertEqual(result['metadata']['awarding_agency_name'],'')
        self.assertEqual(result['metadata']['awarding_agency_code'],'999')
    def test_missing_or_fractional_cents_and_unofficial_sources_stop_collection(self):
        for amount in ['', 'NaN', '0.001', '90071992547409.92']:
            row=source();row['federal_action_obligation']=amount
            with self.assertRaises(Exception):self.normalize(row)
        for url in ['http://www.usaspending.gov/award/a','https://www.usaspending.gov.evil.test/award/a','https://user@www.usaspending.gov/award/a']:
            row=source();row['usaspending_permalink']=url
            with self.assertRaises(ValueError):self.normalize(row)
        row=source();row['contract_transaction_unique_key']=''
        with self.assertRaises(ValueError):self.normalize(row)

if __name__=='__main__':unittest.main()
