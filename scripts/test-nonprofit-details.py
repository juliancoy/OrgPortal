import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('details',pathlib.Path(__file__).with_name('prepare-nonprofit-details.py'))
d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
S={'id':'filing','ein':'123456789','name':'Filer','periodStart':'2024-07-01','periodEnd':'2025-06-30','accountingBasis':'accrual','sourceUrl':'https://example.org/filing','retrievedAt':'2026-11-24'}
def html(values):
    prefix='/AppData/SubmissionHeaderAndDocument/'
    return (f'<span id="{prefix}ReturnHeader[1]/Filer[1]/EIN[1]">12-3456789</span>'+''.join(f'<span id="{prefix}SubmissionDocument/{key}">{value}</span>' for key,value in values.items())).encode()
class DetailTests(unittest.TestCase):
 def test_grant_cash_and_non_cash_remain_detail_not_payment(self):
    prefix='IRS990ScheduleI[1]/RecipientTable[1]/'
    raw=html({prefix+'RecipientBusinessName[1]/BusinessNameLine1Txt[1]':'Example institution',prefix+'RecipientEIN[1]':'98-7654321',prefix+'CashGrantAmt[1]':'1,000',prefix+'NonCashAssistanceAmt[1]':'50',prefix+'USAddress[1]/AddressLine1Txt[1]':'PRIVATE STREET'})
    nodes,rows,coverage=d.detail_rows(raw,S,'filer','grant')
    self.assertEqual([r['amount'] for r in rows],[1000,50]);self.assertTrue(all(r['kind']=='expense_detail' for r in rows))
    self.assertNotIn('PRIVATE STREET',str((nodes,rows)));self.assertEqual(coverage['reportedGroups'],1)
    self.assertEqual(rows[0]['provenance']['recipientEin'],'987654321')
 def test_legacy_contractor_and_individual_withholding(self):
    p='IRS990[1]/ContractorCompensation[1]/';q='IRS990[1]/ContractorCompensation[2]/'
    raw=html({p+'NameOfContractor[1]/NameBusiness[1]/BusinessNameLine1[1]':'Company',p+'Compensation[1]':'123',q+'NameOfContractor[1]/NamePerson[1]':'PRIVATE PERSON',q+'Compensation[1]':'234'})
    nodes,rows,c=d.detail_rows(raw,S,'filer','contractor');self.assertEqual(len(rows),1);self.assertEqual(c['unidentifiedOrPersonalGroupsWithheld'],1)
    self.assertNotIn('PRIVATE PERSON',str((nodes,rows)))
 def test_wrong_filer_rejected(self):
    with self.assertRaisesRegex(ValueError,'EIN'):d.detail_rows(html({}),{**S,'ein':'999999999'},'filer','grant')
 def test_existing_ein_source_reused_without_matching_names(self):
    nodes=[{'id':'irs:recipient:ein:123456789','name':'Changed spelling','identifiers':{'ein':'123456789'}},{'id':'unmatched','name':'Same spelling','identifiers':{'ein':'987654321'}}]
    rows=[{'target':nodes[0]['id'],'provenance':{}},{'target':'unmatched','provenance':{}}]
    ns,rs=d.reuse_irs_source_ids(nodes,rows,{'nonprofit:123456789'})
    self.assertEqual(rs[0]['target'],'nonprofit:123456789');self.assertEqual(ns[0]['id'],rs[0]['target']);self.assertEqual(rs[1]['target'],'unmatched')
if __name__=='__main__':unittest.main()
