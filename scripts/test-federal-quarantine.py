import csv,hashlib,importlib.util,io,json,pathlib,tempfile,unittest,zipfile
spec=importlib.util.spec_from_file_location('review',pathlib.Path(__file__).with_name('review-federal-quarantine.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ReviewTests(unittest.TestCase):
 def test_original_row_checks_and_missing_labels_never_invent_geography(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);source=root/'source';source.mkdir();out=root/'review'
   rows=[]
   for i,state in enumerate(['MD','VIRGINIA']):rows.append({'contract_transaction_unique_key':'TX'+str(i),'contract_award_unique_key':'AWD','action_date':'2003-01-01','federal_action_obligation':'-12.34','awarding_agency_name':'Agency','awarding_agency_code':'001','recipient_name':'','recipient_uei':'ABCD12345678','recipient_state_code':'VA','recipient_country_code':'USA','primary_place_of_performance_state_name':state,'primary_place_of_performance_country_code':'USA','usaspending_permalink':'https://www.usaspending.gov/award/AWD/'})
   buf=io.StringIO();writer=csv.DictWriter(buf,fieldnames=rows[0]);writer.writeheader();writer.writerows(rows)
   archive=source/'source.zip'
   with zipfile.ZipFile(archive,'w') as z:z.writestr('records.csv',buf.getvalue())
   sha=hashlib.sha256(archive.read_bytes()).hexdigest();(source/'manifest.json').write_text(json.dumps({'sources':[{'file':archive.name,'sha256':sha,'requestedAt':'2026-11-24T00:00:00Z'}]}))
   q=root/'quarantine.jsonl';entries=[{'file':archive.name,'sourceSha256':sha,'csvFile':'records.csv','rowNumber':i+1,'row':row} for i,row in enumerate(rows)];q.write_text('\n'.join(json.dumps(e) for e in entries)+'\n')
   inputs=[{'source':str(source),'quarantine':str(q)}];m.review(inputs,out)
   native=json.loads((out/'observations.jsonl').read_text());self.assertEqual(native['metadata']['primary_place_of_performance_state_code'],'MD');self.assertEqual(native['recipient_label'],'Recipient not reported (ABCD12345678)')
   extra=json.loads((out/'geography-additions.json').read_text())['relationships'];self.assertEqual(len(extra),1);self.assertEqual(extra[0]['amount'],-12.34);self.assertFalse(extra[0]['provenance']['marylandGeographyVerified']);self.assertEqual(extra[0]['provenance']['recipient_state_code'],'VA')
   entries[0]['row']['federal_action_obligation']='999';q.write_text('\n'.join(json.dumps(e) for e in entries)+'\n')
   with self.assertRaisesRegex(ValueError,'differs from original'):m.review(inputs,root/'tampered')
if __name__=='__main__':unittest.main()
