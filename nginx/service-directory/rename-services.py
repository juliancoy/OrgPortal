#!/usr/bin/env python3
"""Rename local containers in place, retaining data, IPs, and old DNS aliases."""
import argparse
from pathlib import Path
import subprocess
import sys
import docker
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from service_names import RENAMES


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    client = docker.from_env()
    containers = client.containers.list()
    names = {c.name for c in client.containers.list(all=True)}
    plan = [(c, RENAMES[c.name]) for c in containers if c.name in RENAMES]
    for c, new in plan:
        if new in names:
            raise RuntimeError(f'Destination already exists: {new}')
        print(f'{c.name} -> {new}')
    if not args.apply:
        return
    for c, new in plan:
        old = c.name
        networks = c.attrs['NetworkSettings']['Networks']
        c.rename(new)
        for net_name, endpoint in networks.items():
            if net_name in ('host', 'none', 'bridge'):
                continue
            network = client.networks.get(net_name)
            aliases = list(dict.fromkeys([*(endpoint.get('Aliases') or []), old, new]))
            network.disconnect(c)
            try:
                network.connect(c, aliases=aliases, ipv4_address=endpoint['IPAddress'])
            except Exception:
                c.rename(old)
                network.connect(c, aliases=aliases, ipv4_address=endpoint['IPAddress'])
                raise
    # Update bind-mounted configs in place, preserving the inode seen by NGINX.
    for c in containers:
        c.reload()
        for mount in c.attrs['Mounts']:
            if mount['Type'] != 'bind' or mount['Destination'] != '/etc/nginx/nginx.conf':
                continue
            path = Path(mount['Source'])
            before = path.read_text()
            after = before
            for old, new in sorted(RENAMES.items(), key=lambda item: -len(item[0])):
                after = after.replace(old, new)
            if after == before:
                continue
            path.write_text(after)
            try:
                subprocess.run(['docker', 'exec', c.name, 'nginx', '-t'], check=True)
                subprocess.run(['docker', 'exec', c.name, 'nginx', '-s', 'reload'], check=True)
            except subprocess.CalledProcessError:
                path.write_text(before)
                raise
    print(f'Renamed {len(plan)} running services; volumes and published ports are unchanged.')


if __name__ == '__main__':
    main()
