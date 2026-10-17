"""Security boundaries for the host-side developer sign-in helper."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
import local_developer
spec=importlib.util.spec_from_file_location('local_login',root/'scripts/local-login.py')
login=importlib.util.module_from_spec(spec)
spec.loader.exec_module(login)

class LocalLoginTests(unittest.TestCase):
    def test_rejects_remote_origins_and_embedded_credentials(self):
        for base in ['https://orgportal.cc','https://localhost.evil.test','https://user:password@localhost:8443','https://localhost:8443/pidp','https://localhost:8443?next=https://evil.test']:
            with self.subTest(base=base),self.assertRaises(ValueError):login.local_base(base)
        self.assertEqual(login.local_base('https://localhost:8443/'),'https://localhost:8443')

    def test_rejects_external_and_ambiguous_return_paths(self):
        for target in ['https://evil.test','//evil.test','/\\evil.test','/admin\r\nSet-Cookie: injected']:
            with self.subTest(target=target),self.assertRaises(ValueError):login.local_next(target)
        self.assertEqual(login.local_next('/ecosystem/network/3d?org=tedco'),'/ecosystem/network/3d?org=tedco')

    def test_remote_identity_container_is_rejected_before_database_access(self):
        remote={'State':{'Running':True},'Config':{'Env':['PUBLIC_BASE_URL=https://orgportal.cc/pidp']}}
        context=type('Result',(),{'returncode':0,'stdout':'"unix:///var/run/docker.sock"'})()
        with patch.object(login.subprocess,'run',return_value=context),patch.object(login,'docker_inspect',return_value=remote) as inspect:
            with self.assertRaises(RuntimeError):login.preflight('identity','https://localhost:8443')
            self.assertEqual(inspect.call_count,1)

    def test_remote_docker_context_is_rejected_before_inspecting_services(self):
        context=type('Result',(),{'returncode':0,'stdout':'"ssh://remote-host"'})()
        with patch.object(login.subprocess,'run',return_value=context),patch.object(login,'docker_inspect') as inspect:
            with self.assertRaises(RuntimeError):login.preflight('identity','https://localhost:8443')
            inspect.assert_not_called()

    def test_admin_setup_rejects_remote_gateway_before_docker_access(self):
        with self.assertRaises(RuntimeError):local_developer.ensure_local_admin('identity','https://orgportal.cc')

    def test_local_admin_allowlist_survives_restart_without_affecting_other_deployments(self):
        with tempfile.TemporaryDirectory() as directory,patch.dict(os.environ,{'ORGPORTAL_LOCAL_STATE_DIR':directory}):
            self.assertEqual(local_developer.local_admin_ids('https://localhost:8443','existing'),f'existing,{local_developer.ADMIN_ID}')
            self.assertEqual(local_developer.local_admin_ids('https://localhost:8444','existing'),f'existing,{local_developer.ADMIN_ID}')
            self.assertEqual(local_developer.local_admin_ids('https://orgportal.cc','existing'),'existing')

if __name__=='__main__':unittest.main()
