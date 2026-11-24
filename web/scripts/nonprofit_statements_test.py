import sys,pathlib,unittest,copy
sys.path.insert(0,str(pathlib.Path(__file__).parent/'lib'))
from nonprofits_test import xml,ROW
from irs_nonprofits import normalize_filing
from nonprofit_statements import statement_evidence
from rendered_990_statement import normalize_rendered_statement
FORM='''<IRS990><CYContributionsGrantsAmt>20</CYContributionsGrantsAmt><CYProgramServiceRevenueAmt>80</CYProgramServiceRevenueAmt><CYInvestmentIncomeAmt>-5</CYInvestmentIncomeAmt><CYOtherRevenueAmt>5</CYOtherRevenueAmt><CYTotalRevenueAmt>100</CYTotalRevenueAmt><ProgramServiceRevenueGrp><Desc>TUITION</Desc><TotalRevenueColumnAmt>30</TotalRevenueColumnAmt></ProgramServiceRevenueGrp><ProgramServiceRevenueGrp><Desc>RESEARCH</Desc><TotalRevenueColumnAmt>40</TotalRevenueColumnAmt></ProgramServiceRevenueGrp><TotalOthProgramServiceRevGrp><TotalRevenueColumnAmt>10</TotalRevenueColumnAmt></TotalOthProgramServiceRevGrp><CYGrantsAndSimilarPaidAmt>5</CYGrantsAndSimilarPaidAmt><CYSalariesCompEmpBnftPaidAmt>65</CYSalariesCompEmpBnftPaidAmt><CYOtherExpensesAmt>10</CYOtherExpensesAmt><CYTotalExpensesAmt>80</CYTotalExpensesAmt></IRS990>'''
class StatementTests(unittest.TestCase):
 def summary(self,form=FORM):return normalize_filing(xml(form),ROW,'https://apps.irs.gov/archive.zip','2026-11-24')[0]
 def review(self,s):return {'filingId':s['id'],'sourceSha256':s['sourceSha256'],'publicLines':[{'sourceLine':'ProgramServiceRevenueGrp[1]/TotalRevenueColumnAmt','label':'TUITION','reason':'Education purchased for students.'}]}
 def test_reconciles_disjoint_lines_without_double_counting_total(self):
  s=self.summary();self.assertTrue(all(x['reconciled'] for x in s['statements'].values()))
  nodes,edges=statement_evidence(s,'university',self.review(s));public=[r for r in edges if r['source']=='aggregate:public']
  self.assertEqual(len(public),1);self.assertEqual(public[0]['amount'],30)
  self.assertEqual(sum(r['amount'] for r in edges if r['kind']=='revenue'),100)
  self.assertEqual(sum(r['amount'] for r in edges if r['kind']=='expense'),80)
  self.assertEqual(public[0]['financialFactType'],'revenue');self.assertEqual(public[0]['measurement'],'period_total')
  self.assertTrue(all(r['kind']!='transfer' for r in edges));self.assertIn(-5,[r['amount'] for r in edges])
  self.assertEqual(public[0]['provenance']['sourceSha256'],s['sourceSha256'])
 def test_public_is_never_inferred_from_program_service_total(self):
  s=self.summary();_,edges=statement_evidence(s,'university')
  self.assertFalse(any(r['source']=='aggregate:public' for r in edges))
  incomplete=self.summary(FORM.replace('<TotalRevenueColumnAmt>40</TotalRevenueColumnAmt>','<TotalRevenueColumnAmt>39</TotalRevenueColumnAmt>'))
  self.assertIn('CYProgramServiceRevenueAmt',[r['sourceLine'] for r in incomplete['statements']['revenue']['lines']])
  with self.assertRaisesRegex(ValueError,'exact reviewed'):statement_evidence(incomplete,'university',self.review(incomplete))
 def test_requires_source_checksum_and_exact_label_and_reconciled_amounts(self):
  s=self.summary();review=self.review(s);review['sourceSha256']='0'*64
  with self.assertRaisesRegex(ValueError,'checksum'):statement_evidence(s,'university',review)
  review=self.review(s);review['publicLines'][0]['label']='PATIENT SERVICES'
  with self.assertRaisesRegex(ValueError,'exact reviewed'):statement_evidence(s,'university',review)
  s=self.summary(FORM.replace('<CYTotalRevenueAmt>100','<CYTotalRevenueAmt>101'))
  _,edges=statement_evidence(s,'university');self.assertFalse(any(r['kind']=='revenue' for r in edges))
 def test_separate_filers_and_same_period_do_not_merge(self):
  a=self.summary();b=copy.deepcopy(a);b['ein']='098765432';b['id']='second-filing'
  _,ae=statement_evidence(a,'university',self.review(a));_,be=statement_evidence(b,'hospital',self.review(b))
  self.assertTrue(set(r['id'] for r in ae).isdisjoint(r['id'] for r in be))
  self.assertEqual([r['target'] for r in be if r['source']=='aggregate:public'],['hospital'])
 def test_rendered_source_checks_ein_period_and_retains_original_format(self):
  prefix='/AppData/SubmissionHeaderAndDocument/'
  values={'ReturnHeader[1]/Filer[1]/EIN[1]':'01-2345678','ReturnHeader[1]/Filer[1]/BusinessName[1]/BusinessNameLine1Txt[1]':'Example','ReturnHeader[1]/TaxPeriodBeginDt[1]':'01-01-2024','ReturnHeader[1]/TaxPeriodEndDt[1]':'12-31-2024','SubmissionDocument/IRS990[1]/CYTotalRevenueAmt[1]':'1,000','SubmissionDocument/IRS990[1]/CYProgramServiceRevenueAmt[1]':'1,000'}
  raw=''.join(f'<span id="{prefix+k}">{v}</span>' for k,v in values.items()).encode()
  s=normalize_rendered_statement(raw,ROW,'https://example.org/IRS990','today');self.assertEqual(s['revenue'],1000);self.assertTrue(s['statements']['revenue']['reconciled']);self.assertEqual(s['sourceFormat'],'irs_efile_rendered_html')
  self.assertEqual(s['filedAt'],'');self.assertIsNone(s['amended'])
  with self.assertRaisesRegex(ValueError,'EIN'):normalize_rendered_statement(raw,{**ROW,'EIN':'999999999'},'','')
if __name__=='__main__':unittest.main()
