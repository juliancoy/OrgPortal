import io
import unittest
from unittest.mock import patch
import urllib.error
from portal_sync import PortalSync

class SyncTests(unittest.TestCase):
    def test_transient_failures_retry_but_invalid_reports_do_not(self):
        sync=PortalSync()
        with patch('pathlib.Path.read_text',return_value='{"token":"fixture"}'), patch('portal_sync.time.sleep'), patch('portal_sync.urllib.request.urlopen',side_effect=[urllib.error.HTTPError('https://fixture',500,'error',{},None),io.BytesIO(b'{"id":"ok"}')]) as request:
            self.assertEqual(sync.request('/collector',{})['id'],'ok')
            self.assertEqual(request.call_count,2)
            self.assertEqual(request.call_args.args[0].get_header('User-agent'),'OrgPortalWebsiteProbe/1.0')
        with patch('pathlib.Path.read_text',return_value='{"token":"fixture"}'), patch('portal_sync.urllib.request.urlopen',side_effect=urllib.error.HTTPError('https://fixture',400,'invalid',{},None)) as request:
            with self.assertRaises(urllib.error.HTTPError):sync.request('/collector',{})
            self.assertEqual(request.call_count,1)

if __name__=='__main__':unittest.main()
