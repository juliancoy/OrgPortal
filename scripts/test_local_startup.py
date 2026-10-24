"""Startup must preserve the existing namespace and fail safely when DB is down."""
import contextlib
import importlib.util
import io
import json
import os
from types import SimpleNamespace
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch, Mock

PORTAL=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(PORTAL))
import docker_utils
spec=importlib.util.spec_from_file_location('organization_run',PORTAL.parent/'run.py')
launcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(launcher)

class StartupTests(unittest.TestCase):
    def test_local_identity_registers_only_configured_portal_origins(self):
        spec=importlib.util.spec_from_file_location('portal_run',PORTAL/'run.py')
        portal_run=importlib.util.module_from_spec(spec);spec.loader.exec_module(portal_run)
        origins=['https://localhost:8443','https://127.0.0.1:8443']
        with patch.dict(os.environ,{},clear=True):
            env=portal_run._pidp_env(SimpleNamespace(),'local-database','https://localhost:8443',origins)
        self.assertEqual(env['PUBLIC_BASE_URL'],'https://id.localhost:8443')
        self.assertEqual(env['ALLOWED_ORIGINS'],'https://id.localhost:8443')
        self.assertEqual(env['GOOGLE_REDIRECT_URI'],'https://id.localhost:8443/auth/google/callback')
        registrations=json.loads(env['PORTAL_CLIENTS_JSON'])
        self.assertEqual(set(registrations),set(origins))
        self.assertEqual(env['PORTAL_AUTH_ORIGINS'],','.join(origins))
        for client in registrations.values():
            self.assertEqual(client['accountApp'],'orgportal')
            self.assertEqual(client['callbacks'],['/auth/callback'])
            self.assertNotIn('restartOrigin',client)


    def test_preview_registration_requires_exact_https_loopback_origins(self):
        spec=importlib.util.spec_from_file_location('portal_preview',PORTAL/'run.py')
        portal_run=importlib.util.module_from_spec(spec);spec.loader.exec_module(portal_run)
        previews=['https://localhost:8769','https://localhost:8770','https://127.0.0.1:8770']
        with patch.dict(os.environ,{'ORGPORTAL_LOCAL_PREVIEW_ORIGINS':','.join(previews)},clear=True):
            self.assertEqual(portal_run._local_preview_origins(),previews)
            origins=['https://localhost:8443',*portal_run._local_preview_origins()]
            env=portal_run._pidp_env(SimpleNamespace(),'local-database','https://localhost:8443',origins)
            self.assertEqual(set(json.loads(env['PORTAL_CLIENTS_JSON'])),set(origins))
            self.assertEqual(set(env['PORTAL_AUTH_ORIGINS'].split(',')),set(origins))
        for value in ['https://lifetech.fyi','https://localhost:8770/','https://localhost:8770/path','http://localhost:8770','https://localhost:8770?x=1']:
            with self.subTest(value=value),patch.dict(os.environ,{'ORGPORTAL_LOCAL_PREVIEW_ORIGINS':value},clear=True):
                with self.assertRaises(RuntimeError):portal_run._local_preview_origins()

    def test_oauth_uses_explicit_environment_credentials_and_rejects_examples(self):
        spec=importlib.util.spec_from_file_location('portal_run_oauth',PORTAL/'run.py')
        portal_run=importlib.util.module_from_spec(spec);spec.loader.exec_module(portal_run)
        example=SimpleNamespace(PIDP_GOOGLE_CLIENT_ID='google-client-id',PIDP_GOOGLE_CLIENT_SECRET='google-client-secret')
        with patch.dict(os.environ,{},clear=True):
            self.assertEqual(portal_run._local_oauth_credentials(example,'google'),(None,None))
        with patch.dict(os.environ,{'PIDP_GOOGLE_CLIENT_ID':'configured-id','PIDP_GOOGLE_CLIENT_SECRET':'configured-secret'},clear=True):
            self.assertEqual(portal_run._local_oauth_credentials(example,'google'),('configured-id','configured-secret'))

    def test_invalid_service_timeout_fails_before_changing_the_stack(self):
        spec=importlib.util.spec_from_file_location('portal_timeout',PORTAL/'run.py')
        portal_run=importlib.util.module_from_spec(spec);spec.loader.exec_module(portal_run)
        for value in ['bad', '0', '3601']:
            with self.subTest(value=value), patch.dict(os.environ, {'ORGPORTAL_LOCAL_SERVICE_TIMEOUT': value}), patch.object(docker_utils, 'ensure_network') as network:
                with self.assertRaisesRegex(RuntimeError, 'ORGPORTAL_LOCAL_SERVICE_TIMEOUT'):
                    portal_run.run('unused-', 'unused')
                network.assert_not_called()

    def test_root_launcher_reuses_existing_local_data_namespace(self):
        args=launcher.parse_args([])
        self.assertEqual((args.prefix,args.network,args.port),('bmoremedtech-','bmoremedtech',8443))
        self.assertIsNone(args.login)
        self.assertEqual(launcher.parse_args(['--login','admin']).login,'admin')

    def test_database_wait_is_bounded_and_never_logs_credentials(self):
        from docker_utils import sdk
        from docker.errors import ContainerError
        client=Mock();client.containers.run.side_effect=ContainerError(None,1,'pg_isready','postgres','not ready')
        with patch.object(sdk,'client',return_value=client),patch.object(sdk,'ensure_image',return_value='postgres:15-alpine'),patch.object(sdk.time,'sleep'):
            with self.assertRaisesRegex(RuntimeError,'timed out'):
                sdk.wait_for_db('local','postgresql://fixture:do-not-print@db:5432/test',max_attempts=2)
        self.assertEqual(client.containers.run.call_count,2)
        self.assertNotIn('do-not-print',str(client.containers.run.call_args))

    def test_ready_database_returns_after_first_probe(self):
        from docker_utils import sdk
        client=Mock()
        with patch.object(sdk,'client',return_value=client),patch.object(sdk,'ensure_image',return_value='postgres:15-alpine'):
            sdk.wait_for_db('local','postgresql://fixture:secret@db:5432/test')
        self.assertEqual(client.containers.run.call_count,1)
        self.assertNotIn('secret',str(client.containers.run.call_args))

if __name__=='__main__':unittest.main()
