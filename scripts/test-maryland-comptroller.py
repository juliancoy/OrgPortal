import importlib.util
from pathlib import Path
import unittest
import tempfile

spec=importlib.util.spec_from_file_location('collector',Path(__file__).with_name('collect-maryland-comptroller.py'))
collector=importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

class CollectorTests(unittest.TestCase):
    def test_exact_signed_cents_and_invalid_formats(self):
        self.assertEqual(collector.cents('($1,234.56)'),-123456)
        self.assertEqual(collector.cents('$0.00'),0)
        self.assertEqual(collector.cents('-$5.01'),-501)
        for value in ['undisclosed','$1.234','NaN']:
            with self.assertRaises(ValueError): collector.cents(value)

    def test_payment_identity_keeps_leading_zeros_and_agency_boundary(self):
        raw=b'<table id="searchResultsTable"><tbody><tr><td>Agency</td><td>Payee</td><td>00012</td><td>2026/10/01</td><td>$123.45</td></tr></tbody></table>'
        first=collector.parse_payments(raw,'A')[0]
        self.assertEqual(first['external_id'],'00012')
        self.assertEqual(first['amount_cents'],12345)
        self.assertNotEqual(first['id'],collector.parse_payments(raw,'B')[0]['id'])
        self.assertEqual(first['fact_type'],'disbursement')
        with self.assertRaises(ValueError): collector.parse_payments(raw.replace(b'</tbody>',raw.split(b'<tbody>')[1]),'A')

    def test_large_searches_partition_dates_and_reconcile_baseline(self):
        def page(start,end):
            rows=[]
            for i in range(start,end):
                day='2026/10/01' if i<2500 else '2026/10/02'
                rows.append(f'<tr><td>A</td><td>Payee {i}</td><td>{i:08}</td><td>{day}</td><td>$1.00</td></tr>')
            return '<table id="searchResultsTable"><tbody>'+''.join(rows)+'</tbody></table>'
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)
            (output/'mdview-A.html').write_text(page(0,5000))
            (output/'mdview-A-1900-01-01-2026-10-01.html').write_text(page(0,2500))
            (output/'mdview-A-2026-10-02-2200-12-31.html').write_text(page(2500,5000))
            rows,sources=collector.fetch_payments('A',output)
            self.assertEqual(len(rows),5000)
            self.assertEqual(len(sources),3)
            self.assertEqual(sum(r['amount_cents'] for r in rows),500000)
            (output/'mdview-A-2026-10-02-2200-12-31.html').write_text(page(2501,5000))
            with self.assertRaisesRegex(ValueError,'dropped baseline'):
                collector.fetch_payments('A',output)

    def test_missing_and_changed_source_tables_fail_closed(self):
        with self.assertRaises(ValueError): collector.parse_bpw(b'<html>maintenance</html>')
        with self.assertRaises(ValueError): collector.parse_payments(b'<html>maintenance</html>','A')
        with self.assertRaises(ValueError): collector.parse_payments(b'<table id="searchResultsTable"><tbody><tr><td>changed</td></tr></tbody></table>','A')

if __name__=='__main__': unittest.main()
