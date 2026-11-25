import hashlib,importlib.util,json,pathlib,tempfile,unittest
spec=importlib.util.spec_from_file_location('merge',pathlib.Path(__file__).with_name('merge-federal-observations.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class MergeTests(unittest.TestCase):
 def test_preserves_baseline_deduplicates_and_reconciles_signed_cents(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp)
   def row(id,amount=1,sha='a'):return {'id':id,'amount_cents':amount,'metadata':{'fiscal_year':'2001'},'source_sha256':sha,'retrieved_at':'now'}
   def source(name,rows):
    p=root/name;p.write_text('\n'.join(json.dumps(row) for row in rows)+'\n');return {'file':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
   baseline=source('baseline',[row('a'),row('c',-5)])
   new=source('new',[row('a',sha='b'),row('b',9),row('c',-5,sha='b')]);out=root/'merged.jsonl'
   report=m.merge([baseline,new],out);result=[json.loads(line) for line in out.read_text().splitlines()]
   self.assertEqual([r['id'] for r in result],['a','b','c']);self.assertEqual(result[0],row('a'));self.assertEqual(report['totals']['2001'],{'records':3,'amount_cents':5});self.assertEqual(report['inputs'][1]['duplicates'],2)
   with self.assertRaisesRegex(ValueError,'checksum'):m.merge([{**baseline,'sha256':'bad'},new],root/'bad.jsonl')
   changed=source('changed',[row('a',2)]);conflict=root/'conflict.jsonl'
   with self.assertRaisesRegex(ValueError,'conflicting'):m.merge([baseline,changed],conflict)
   self.assertFalse(conflict.exists());self.assertEqual(json.loads(conflict.with_suffix('.conflicts.jsonl').read_text())['candidate']['amount_cents'],2)
   unsorted=source('unsorted',[row('z'),row('a')])
   with self.assertRaisesRegex(ValueError,'Unsorted'):m.merge([baseline,unsorted],root/'invalid.jsonl')
if __name__=='__main__':unittest.main()
