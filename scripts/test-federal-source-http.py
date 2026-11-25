import sys,pathlib,unittest,socket,time
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).parent))
import federal_source_http as source

class AddressTests(unittest.TestCase):
 def test_all_families_scopes_rotation_and_recovery(self):
    ipv6=(socket.AF_INET6,socket.SOCK_STREAM,6,'',('fe80::1',443,0,7))
    second=(socket.AF_INET6,socket.SOCK_STREAM,6,'',('2001:db8::2',443,0,0))
    ipv4=(socket.AF_INET,socket.SOCK_STREAM,6,'',('192.0.2.1',443))
    with patch.object(source.socket,'getaddrinfo',return_value=[ipv6,second,ipv4]) as resolver:
        self.assertEqual(source.address_order('source.test',443,0),[ipv6,ipv4,second])
        self.assertEqual(source.address_order('source.test',443,1)[0],ipv4)
        source._preferred['source.test']=(socket.AF_INET,time.monotonic())
        self.assertEqual(source.address_order('source.test',443,0)[0],ipv4)
        self.assertEqual(source.address_order('source.test',443,1)[0],ipv6)
        source._preferred['source.test']=(socket.AF_INET,time.monotonic()-301)
        self.assertEqual(source.address_order('source.test',443,0)[0],ipv6)
        self.assertEqual(resolver.call_count,5)
    source._preferred.clear()
 def test_tls_keeps_hostname_and_verification(self):
    with source.session() as session:
        self.assertTrue(session.verify)
        self.assertEqual(session.headers["Connection"],"close")
        pool=session.get_adapter('https://source.test').poolmanager.connection_from_host('source.test',443,scheme='https')
        connection=pool._new_conn()
        self.assertEqual(connection.host,'source.test')
        self.assertEqual(connection._dns_host,'source.test')

if __name__=='__main__':unittest.main()
