import importlib.util, pathlib, tempfile, unittest, json, zipfile, csv, io, hashlib

def module(name):
    spec=importlib.util.spec_from_file_location(name,pathlib.Path(__file__).with_name(name+'.py'))
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result

university=module('prepare-university-audits')
recipient=module('prepare-recipient-federal')
bulk=module('prepare-federal-bulk')
subawards=module('prepare-federal-subawards')

class BackfillTests(unittest.TestCase):
    def test_operating_leaves_exclude_nested_subtotals(self):
        source=['Operating revenues:','Tuition and fees 20 20','Less financial aid (5) (5)',
                'Tuition and fees, net of financial aid 15 15','Grants, contracts, and similar agreements 10 10',
                'Facilities and administrative cost recoveries 5 5','Applied Physics Laboratory contract revenues 10 10',
                'Sponsored research revenues 25 25','Total operating revenues 40 40','Operating expenses:',
                'Compensation 20 20','Benefits 5 5','Compensation and benefits 25 25','Interest 5 5','Total operating expenses 30 30']
        with tempfile.TemporaryDirectory() as directory:
            p=pathlib.Path(directory)/'university-2026-web.txt'
            p.write_text('\n'.join(f'L{i}@P4: {v}' for i,v in enumerate(source)))
            rows=university.extract(p)
            self.assertEqual([r['fiscalYear'] for r in rows],[2026,2025])
            self.assertEqual(rows[0]['revenue'],40000)
            self.assertEqual(len(rows[0]['entries']),7)
            self.assertFalse(rows[0]['originalPdfChecksumAvailable'])
            p.write_text(p.read_text().replace('Total operating revenues 40','Total operating revenues 41'))
            with self.assertRaises(ValueError):university.extract(p)

    def test_source_export_identity_and_count_guards(self):
        row={'contract_transaction_unique_key':'CONT_TX_1','contract_award_unique_key':'CONT_AWD_1','action_date':'2010-04-01',
             'federal_action_obligation':'-123.45','awarding_agency_name':'Agency','awarding_agency_code':'075',
             'recipient_name':'Reported recipient','recipient_uei':'ABCDEFGHIJKL','recipient_state_code':'VA',
             'primary_place_of_performance_state_name':'VIRGINIA','usaspending_permalink':'https://www.usaspending.gov/award/CONT_AWD_1/',
             'recipient_address':'PRIVATE ADDRESS MUST NOT BE RETAINED'}
        with tempfile.TemporaryDirectory() as directory:
            p=pathlib.Path(directory);csvtext=io.StringIO();writer=csv.DictWriter(csvtext,fieldnames=row);writer.writeheader();writer.writerow(row)
            with zipfile.ZipFile(p/'one.zip','w') as z:z.writestr('rows.csv',csvtext.getvalue())
            manifest=[{'file':'one.zip','sha256':hashlib.sha256((p/'one.zip').read_bytes()).hexdigest(),'status':{'status':'finished','total_rows':1},'request':{},'requestedAt':'2026-11-24T00:00:00Z'}]
            (p/'manifest.partial.json').write_text(json.dumps(manifest));result=recipient.prepare(p);edge=result['relationships'][0]
            self.assertEqual(edge['target'],'usgov:recipient:ABCDEFGHIJKL');self.assertEqual(edge['amount'],-123.45)
            self.assertEqual(edge['financialFactType'],'obligation');self.assertNotIn('PRIVATE ADDRESS',str(result))
            self.assertEqual(edge['id'],recipient.federal.normalize(row,'2026-11-24T00:00:00Z','a'*64,require_maryland=False)['id'])
            manifest[0]['status']['total_rows']=2;(p/'manifest.partial.json').write_text(json.dumps(manifest))
            with self.assertRaises(ValueError):recipient.prepare(p)

    def test_bulk_archive_hash_count_date_and_overlap_reconciliation(self):
        good={'contract_transaction_unique_key':'TX','contract_award_unique_key':'AWD','action_date':'2001-04-01',
              'federal_action_obligation':'-123.45','awarding_agency_name':'Agency','recipient_name':'Recipient',
              'recipient_state_code':'MD','usaspending_permalink':'https://www.usaspending.gov/award/AWD/'}
        bad={**good,'contract_transaction_unique_key':'WRONG_YEAR','action_date':'2002-04-01'}
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);source=root/'source';source.mkdir();out=root/'output';items=[]
            for name in ['recipient','performance']:
                archive=source/(name+'.zip');text=io.StringIO();w=csv.DictWriter(text,fieldnames=good);w.writeheader();w.writerows([good,bad])
                with zipfile.ZipFile(archive,'w') as z:z.writestr('rows.csv',text.getvalue())
                (source/(name+'-status.json')).write_text(json.dumps({'status':'finished','total_rows':2}))
                items.append({'file':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'records':2,
                              'request':{'filters':{'date_range':{'start_date':'2000-10-01','end_date':'2001-09-30'}}},'requestedAt':'2026-11-24T00:00:00Z'})
            (source/'manifest.json').write_text(json.dumps({'sources':items}));bulk.prepare(source,out)
            result=json.loads((out/'manifest.json').read_text());self.assertEqual(result['records'],1)
            self.assertEqual(result['totals'],{'2001':{'records':1,'amount_cents':-12345}})
            self.assertEqual(result['sources'][1]['duplicates'],1)
            self.assertEqual(sum(x['quarantinedRecords'] for x in result['sources']),2)
            self.assertNotIn('WRONG_YEAR',(out/'observations.jsonl').read_text())
            items[0]['sha256']='0'*64;(source/'manifest.json').write_text(json.dumps({'sources':items}))
            with self.assertRaisesRegex(ValueError,'checksum'):bulk.prepare(source,root/'rejected')

    def test_subaward_reports_keep_unknown_counterparties_and_do_not_add_pass_through_funding(self):
        raw={'subaward_sam_report_id':'REPORT_1','subaward_type':'sub-grant','prime_award_unique_key':'AWARD_1',
             'subaward_action_date':'2025-10-01','subaward_amount':'12.34','usaspending_permalink':'https://www.usaspending.gov/award/AWARD_1/',
             'prime_awardee_name':'','subawardee_name':'Reported subrecipient','subawardee_uei':'ABCDEFGHIJKL','subawardee_state_code':'MD'}
        nodes,row=subawards.normalize(raw,'2026-11-24T00:00:00Z','a'*64)
        self.assertFalse(nodes[0]['nameReported']);self.assertEqual(nodes[0]['identityStatus'],'unverified_label')
        self.assertIn('Prime recipient not reported',nodes[0]['name']);self.assertEqual(nodes[1]['id'],'usgov:recipient:ABCDEFGHIJKL')
        self.assertEqual(row['fiscalYear'],2026);self.assertEqual(row['amount'],12.34);self.assertFalse(row['annualAmountEligible'])
        self.assertEqual(row['financialMeasure'],'snapshot');self.assertEqual(row['financialFactType'],'reported_award')
        self.assertNotEqual(row['id'],subawards.normalize({**raw,'subaward_sam_report_id':'REPORT_2'},'2026-11-24T00:00:00Z','a'*64)[1]['id'])
        with self.assertRaises(ValueError):subawards.normalize({**raw,'subawardee_state_code':'VA'},'2026-11-24T00:00:00Z','a'*64)

if __name__=='__main__':unittest.main()
