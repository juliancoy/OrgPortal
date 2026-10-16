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
        registrations=json.loads(env['PORTAL_CLIENTS_JSON'])
        self.assertEqual(set(registrations),set(origins))
        self.assertEqual(env['PORTAL_AUTH_ORIGINS'],','.join(origins))
        for client in registrations.values():
            self.assertEqual(client['accountApp'],'orgportal')
            self.assertEqual(client['callbacks'],['/auth/callback'])
            self.assertNotIn('restartOrigin',client)


    def test_root_launcher_reuses_existing_local_data_namespace(self):
        args=launcher.parse_args([])
        self.assertEqual((args.prefix,args.network,args.port),('bmoremedtech-','bmoremedtech',8443))
        self.assertIsNone(args.login)
        self.assertEqual(launcher.parse_args(['--login','admin']).login,'admin')

    def test_database_wait_is_bounded_and_never_logs_credentials(self):
        output=io.StringIO()
        with patch.object(docker_utils.subprocess,'run',side_effect=subprocess.CalledProcessError(1,['pg_isready'])) as run,patch.object(docker_utils.time,'sleep'),contextlib.redirect_stdout(output):
            with self.assertRaisesRegex(RuntimeError,'after 2 attempts'):
                docker_utils.wait_for_db('local','postgresql://fixture:do-not-print@db:5432/test',max_attempts=2)
            self.assertEqual(run.call_count,2)
        self.assertNotIn('do-not-print',output.getvalue())
        self.assertNotIn('postgresql://',output.getvalue())
        self.assertIn('db:5432',output.getvalue())

    def test_ready_database_returns_after_first_probe(self):
        with patch.object(docker_utils.subprocess,'run') as run,contextlib.redirect_stdout(io.StringIO()):
            docker_utils.wait_for_db('local','postgresql://fixture:secret@db:5432/test')
            self.assertEqual(run.call_count,1)
            self.assertNotIn('secret',' '.join(run.call_args.args[0]))

    def test_container_start_preserves_legacy_dns_through_docker_sdk(self):
        from docker.errors import NotFound
        from docker.models.containers import _create_container_args
        client=Mock()
        client.containers.get.side_effect=NotFound('absent')
        client.api.create_endpoint_config.side_effect=docker_utils.DOCKER_CLIENT.api.create_endpoint_config
        with patch.object(docker_utils,'DOCKER_CLIENT',client),contextlib.redirect_stdout(io.StringIO()):
            docker_utils.run_container({'name':'lifetech-identity-api','image':'python:3.11-slim','network':'bmoremedtech'})
        options=_create_container_args({**client.containers.run.call_args.kwargs,'version':'1.45'})
        aliases=options['networking_config']['EndpointsConfig']['bmoremedtech']['Aliases']
        self.assertIn('lifetech-identity-api',aliases)
        self.assertIn('bmoremedtech-pidp-dev',aliases)

if __name__=='__main__':unittest.main()
