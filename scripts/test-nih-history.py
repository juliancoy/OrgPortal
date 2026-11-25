import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('nih',pathlib.Path(__file__).with_name('prepare-nih-history.py'))
nih=importlib.util.module_from_spec(spec);spec.loader.exec_module(nih)

def source(**extra):
    return dict(appl_id=123,fiscal_year=2025,organization={'org_ipf_code':'4134401','primary_uei':'FTMTDMBR29C7','org_name':'JOHNS HOPKINS UNIVERSITY'},
                agency_ic_admin={'code':'NS','name':'National Institute of Neurological Disorders and Stroke'},award_amount=100,**extra)

class HistoryTests(unittest.TestCase):
    def test_parent_award_is_not_cash_and_personal_fields_are_not_copied(self):
        ns,r=nih.normalize(source(principal_investigators=[{'name':'PRIVATE'}]),'a'*64,'2026-11-24T00:00:00Z')
        self.assertEqual(r['kind'],'reported_award');self.assertEqual(r['target'],'org-johns-hopkins-university')
        self.assertNotIn('PRIVATE',str(r));self.assertEqual(r['date'],'FY2025')
        self.assertEqual(r['provenance']['sourceSha256'],'a'*64)
    def test_subproject_is_separate_nonpayment_evidence(self):
        _,parent=nih.normalize(source(),'a'*64,'now');_,child=nih.normalize(source(subproject_id=12),'a'*64,'now')
        self.assertNotEqual(parent['id'],child['id']);self.assertEqual(child['financialFactType'],'subproject_award')
        self.assertEqual(child['amount'],100)
    def test_missing_amount_is_not_zero_and_conflicting_identity_stops(self):
        row=source();row['award_amount']=None;self.assertIsNone(nih.normalize(row,'a'*64,'now')[1]['amount'])
        row['organization']['primary_uei']='CONFLICT'
        with self.assertRaisesRegex(ValueError,'Conflicting'):nih.normalize(row,'a'*64,'now')
    def test_unreviewed_historical_identity_remains_separate(self):
        row=source();row['organization']['org_ipf_code']='-123';row['organization']['primary_uei']=None
        nodes,r=nih.normalize(row,'a'*64,'now');self.assertEqual(r['target'],'nih:recipient:-123')
        self.assertEqual(nodes[-1]['identityStatus'],'unreviewed')
    def test_imprecise_money_rejected(self):
        for value in ['NaN',0.001,90071992547409.92]:
            row=source();row['award_amount']=value
            with self.assertRaises(ValueError):nih.normalize(row,'a'*64,'now')

if __name__=='__main__':unittest.main()
