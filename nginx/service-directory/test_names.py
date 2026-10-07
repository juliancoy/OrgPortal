import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from service_names import service_name, RENAMES


class ServiceNamesTests(unittest.TestCase):
    def test_tenant_and_role_names_are_distinct(self):
        for tenant in ('bmoremedtech-', 'deism-', 'codecollective-'):
            values = [service_name(tenant, role) for role in ('org', 'chat', 'portal-dev', 'pidp-dev', 'pidpdb', 'local-gateway', 'org-replication')]
            self.assertEqual(len(set(values)), len(values))
        self.assertEqual(service_name('bmoremedtech-', 'org'), 'lifetech-community-api')
        self.assertEqual(service_name('deism-', 'pidpdb'), 'deism-identity-db')
        self.assertEqual(len(set(RENAMES.values())), len(RENAMES))

    def test_generated_gateway_uses_the_new_dependency_names(self):
        root = Path(__file__).resolve().parents[2]
        spec = importlib.util.spec_from_file_location('gateway_test_launcher', root / 'run.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            module.local_dir = Path(directory)
            module.local_nginx_conf = module.local_dir / 'nginx.conf'
            module._write_local_gateway_config('lifetech-community-web', 'lifetech-community-api', 'lifetech-identity-api', '8443', '8001')
            text = module.local_nginx_conf.read_text()
            for target in ('lifetech-community-web:5173', 'lifetech-community-api:8001', 'lifetech-chat-api:8003', 'lifetech-identity-api:8000', 'local-service-directory:8080'):
                self.assertIn(target, text)


if __name__ == '__main__':
    unittest.main()
