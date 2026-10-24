"""Explicit host-side provisioning for the synthetic local administrator."""
import json
import os
from pathlib import Path
import time
from uuid import NAMESPACE_URL, uuid5
from urllib.parse import urlsplit

ADMIN_ID = str(uuid5(NAMESPACE_URL, 'orgportal:local-developer-admin'))


def state_file():
    root = Path(os.environ.get('ORGPORTAL_LOCAL_STATE_DIR', Path(__file__).resolve().parent / '.local'))
    root.mkdir(parents=True, exist_ok=True)
    return root / 'developer-admins.json'


def local_admin_ids(base, existing=''):
    ids = [value.strip() for value in existing.split(',') if value.strip()]
    if urlsplit(base).hostname in {'localhost', 'id.localhost', '127.0.0.1', '::1'} and ADMIN_ID not in ids:
        ids.append(ADMIN_ID)
    return ','.join(ids)


def ensure_local_admin(name, base):
    # The caller first validates the loopback gateway and database container.
    if urlsplit(base).hostname != 'localhost':
        raise RuntimeError('Local administrator setup requires localhost.')
    import docker
    client = docker.from_env()
    container = client.containers.get(name)
    original = container.attrs
    config, host = original['Config'], original['HostConfig']
    environment = dict(value.split('=', 1) for value in config['Env'] if '=' in value)
    public=urlsplit(environment.get('PUBLIC_BASE_URL',''))
    if public.hostname not in {'localhost','id.localhost'} or (public.scheme,public.port)!=(urlsplit(base).scheme,urlsplit(base).port):
        raise RuntimeError('The selected identity deployment does not match the local gateway.')
    database=client.containers.get(urlsplit(environment.get('DATABASE_URL','')).hostname)
    if not set(original['NetworkSettings']['Networks']).intersection(database.attrs['NetworkSettings']['Networks']):
        raise RuntimeError('The identity database must be on the same local Docker network.')
    ids = [value.strip() for value in environment.get('ADMIN_USER_IDS', '').split(',') if value.strip()]
    if ADMIN_ID not in ids:
        ids.append(ADMIN_ID)
        environment['ADMIN_USER_IDS'] = ','.join(ids)
        network_names = list(original['NetworkSettings']['Networks'])
        endpoints = {}
        for network, endpoint in original['NetworkSettings']['Networks'].items():
            aliases = [alias for alias in endpoint.get('Aliases') or [] if alias not in {original['Id'], original['Id'][:12]}]
            endpoints[network] = client.api.create_endpoint_config(aliases=list(dict.fromkeys([name, *aliases])))
        backup = name + '-before-local-admin-' + str(int(time.time()))
        container.stop(timeout=10)
        container.rename(backup)
        replacement = None
        try:
            created = client.api.create_container(image=config['Image'], command=config['Cmd'],
                entrypoint=config['Entrypoint'], name=name, environment=environment,
                host_config=host, networking_config=client.api.create_networking_config(endpoints),
                working_dir=config['WorkingDir'], user=config['User'], labels=config.get('Labels'),
                detach=True, stdin_open=config['OpenStdin'], tty=config['Tty'])
            replacement = client.containers.get(created['Id'])
            replacement.start()
            # Wait for the local API process before replacing its old DNS target.
            for _ in range(45):
                check = replacement.exec_run(['/venv/bin/python', '-c',
                    "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=2)"])
                if check.exit_code == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError('Local identity service did not restart.')
            for gateway in client.containers.list():
                ports = gateway.attrs['NetworkSettings'].get('Ports', {})
                if any(binding.get('HostPort') == base.rsplit(':', 1)[-1] for bindings in ports.values() for binding in bindings or []):
                    gateway.exec_run(['nginx', '-s', 'reload'])
        except Exception:
            if replacement:
                replacement.remove(force=True)
            container.rename(name)
            container.start()
            raise RuntimeError('Local administrator setup failed; the previous identity container was restored.') from None
        # Keep the stopped original for rollback. Its database and volumes are shared.
    path = state_file()
    values = json.loads(path.read_text()) if path.exists() else {}
    values[base] = ADMIN_ID
    path.write_text(json.dumps(values, indent=2) + '\n')
    path.chmod(0o600)
    return ADMIN_ID
