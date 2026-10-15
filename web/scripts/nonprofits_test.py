import sys,pathlib,unittest,json
sys.path.insert(0,str(pathlib.Path(__file__).parent/'lib'))
from irs_nonprofits import normalize_filing,ein,transactions_sql

def xml(form,schedule='',extra=''):
    return f'''<Return xmlns="http://www.irs.gov/efile"><ReturnHeader><ReturnTs>2025-11-01T00:00:00Z</ReturnTs><TaxPeriodBeginDt>2024-01-01</TaxPeriodBeginDt><TaxPeriodEndDt>2024-12-31</TaxPeriodEndDt><TaxYr>2024</TaxYr><ReturnTypeCd>{'990PF' if form.startswith('<IRS990PF>') else '990'}</ReturnTypeCd><Filer><EIN>012345678</EIN><BusinessName><BusinessNameLine1Txt>Example Foundation</BusinessNameLine1Txt></BusinessName></Filer></ReturnHeader><ReturnData>{form}{schedule}{extra}</ReturnData></Return>'''.encode()
ROW={'EIN':'012345678','TAX_PERIOD':'202412','OBJECT_ID':'202500000000000001'}
class NonprofitParsing(unittest.TestCase):
    def test_foundation_period_finances_paid_future_and_no_personal_fields(self):
        form='''<IRS990PF><AmendedReturnInd>true</AmendedReturnInd><MethodOfAccountingAccrualInd>true</MethodOfAccountingAccrualInd><AnalysisOfRevenueAndExpenses><TotalRevAndExpnssAmt>1000</TotalRevAndExpnssAmt></AnalysisOfRevenueAndExpenses><SupplementaryInformationGrp><GrantOrContributionPdDurYrGrp><RecipientBusinessName><BusinessNameLine1Txt>Example Recipient</BusinessNameLine1Txt></RecipientBusinessName><Amt>100</Amt><RecipientPersonNm>Do not publish</RecipientPersonNm></GrantOrContributionPdDurYrGrp><GrantOrContriApprvForFutGrp><RecipientBusinessName><BusinessNameLine1Txt>Future Recipient</BusinessNameLine1Txt></RecipientBusinessName><Amt>50</Amt></GrantOrContriApprvForFutGrp><TotalGrantOrContriPdDurYrAmt>100</TotalGrantOrContriPdDurYrAmt><TotalGrantOrContriApprvFutAmt>50</TotalGrantOrContriApprvFutAmt></SupplementaryInformationGrp></IRS990PF>'''
        summary,grants=normalize_filing(xml(form),ROW,'https://apps.irs.gov/archive.zip','2026-10-14')
        self.assertEqual(summary['ein'],'012345678');self.assertEqual(summary['revenue'],1000);self.assertIsNone(summary['assets']);self.assertTrue(summary['amended'])
        self.assertEqual([g['grantStatus'] for g in grants],['paid','approved_future']);self.assertEqual(grants[0]['recipientIdentity'],'name_only')
        self.assertNotIn('Do not publish',json.dumps([summary,grants]))
        with self.assertRaisesRegex(ValueError,'reconcile'):normalize_filing(xml(form.replace('>100</TotalGrant','>101</TotalGrant')),ROW,'','')
    def test_schedule_i_identity_noncash_and_redaction(self):
        schedule='''<IRS990ScheduleI><RecipientTable><RecipientEIN>098765432</RecipientEIN><RecipientBusinessName><BusinessNameLine1Txt>Recipient</BusinessNameLine1Txt></RecipientBusinessName><CashGrantAmt>25</CashGrantAmt><NonCashAssistanceAmt>10</NonCashAssistanceAmt></RecipientTable><RecipientTable><RecipientPersonNm>Private name</RecipientPersonNm><CashGrantAmt>5</CashGrantAmt><NonCashAssistanceAmt>0</NonCashAssistanceAmt></RecipientTable></IRS990ScheduleI>'''
        summary,grants=normalize_filing(xml('<IRS990><CYTotalRevenueAmt>0</CYTotalRevenueAmt></IRS990>',schedule),ROW,'','')
        self.assertEqual(summary['revenue'],0);self.assertEqual(len(grants),3);self.assertEqual(grants[0]['recipientEin'],'098765432');self.assertEqual(grants[1]['measure'],'in_kind');self.assertEqual(grants[2]['recipientName'],'Redacted')
        self.assertNotIn('Private name',json.dumps(grants))
    def test_stale_import_cannot_replace_newer_selected_filing(self):
        import sqlite3
        db=sqlite3.connect(':memory:')
        for path in sorted((pathlib.Path(__file__).resolve().parents[2]/'org-worker/migrations').glob('*.sql')):db.executescript(path.read_text())
        summary,_=normalize_filing(xml('<IRS990/>'),ROW,'https://apps.irs.gov/archive.zip','2026-10-14')
        newer={**summary,'id':'newer','filedAt':'2025-11-02T00:00:00Z','selected':True}
        older={**summary,'id':'older','selected':True}
        db.executescript('BEGIN;'+transactions_sql({'filingVersions':[newer],'relationships':[]})+'COMMIT;')
        try:
            with self.assertRaises(sqlite3.IntegrityError):db.executescript('BEGIN;'+transactions_sql({'filingVersions':[older],'relationships':[]})+'COMMIT;')
        finally:db.rollback()
        self.assertEqual(db.execute('SELECT id FROM nonprofit_filing_records WHERE selected=1').fetchone()[0],'newer');db.close()

    def test_rejects_wrong_ein_period_and_entities(self):
        raw=xml('<IRS990/>')
        for row in [{**ROW,'EIN':'999999999'},{**ROW,'TAX_PERIOD':'202312'}]:
            with self.assertRaises(ValueError):normalize_filing(raw,row,'','')
        with self.assertRaises(ValueError):normalize_filing(b'<!DOCTYPE root>'+raw,ROW,'','')
        self.assertEqual(ein(12345678),'012345678');self.assertIsNone(ein('000000000'))
if __name__=='__main__':unittest.main()
