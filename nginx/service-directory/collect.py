#!/usr/bin/env python3
"""Publish a bounded, credential-free inventory of local Docker services and NGINX routes."""
import concurrent.futures
import datetime
import json
import os
from pathlib import Path
import re
import shlex
import socket
import ssl
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request

HERE = Path(__file__).resolve().parent
OUTPUT = HERE / 'runtime'
DIRECTORY = 'local-service-directory'


def command(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=15)
    if result.returncode:
        raise RuntimeError(f'{args[0]} operation failed')
    return result.stdout


def parse_config(text):
    lexer = shlex.shlex(text, posix=True, punctuation_chars='{};')
    lexer.whitespace_split = True
    tokens = iter(lexer)

    def block():
        nodes, words = [], []
        for token in tokens:
            # shlex groups adjacent punctuation, such as "{}".
            pieces = list(token) if re.fullmatch(r'[{};]+', token) else [token]
            for part in pieces:
                if part == '{':
                    nodes.append((words, block()))
                    words = []
                elif part == ';':
                    nodes.append((words, []))
                    words = []
                elif part == '}':
                    return nodes
                else:
                    words.append(part)
        return nodes
    # Split grouped punctuation before parsing so nested empty blocks work.
    normalized = []
    for token in tokens:
        normalized.extend(list(token) if re.fullmatch(r'[{};]+', token) else [token])
    tokens = iter(normalized)
    return block()


def walk(nodes):
    for words, children in nodes:
        yield words, children
        yield from walk(children)


def values(nodes, directive):
    return [words[1:] for words, _ in nodes if words and words[0] == directive]


def container_origins(container, port, tls=False):
    bindings = container['NetworkSettings'].get('Ports', {}).get(f'{port}/tcp') or []
    return list(dict.fromkeys(f'{"https" if tls else "http"}://localhost:{b["HostPort"]}' for b in bindings))


def routes_from_config(text, container, aliases):
    routes = []
    nodes = parse_config(text)
    global_vars = {words[1]: words[2] for words, _ in walk(nodes) if len(words) == 3 and words[0] == 'set'}
    for words, server in walk(nodes):
        if words != ['server']:
            continue
        origins = []
        for listen in values(server, 'listen'):
            match = re.search(r'(\d+)$', listen[0])
            if match:
                origins.extend(container_origins(container, match[1], 'ssl' in listen))
        origins = list(dict.fromkeys(origins))
        server_root = values(server, 'root')
        locations = [(w, c) for w, c in server if w and w[0] == 'location']
        if not locations and server_root:
            locations = [(['location', '/'], [])]
        for loc, body in locations:
            path = loc[-1]
            if path.startswith('@') or '/.well-known/' in path:
                continue
            proxies = values(body, 'proxy_pass') + values(body, 'grpc_pass') + values(body, 'fastcgi_pass')
            returns = values(body, 'return')
            roots = values(body, 'root') or values(body, 'alias') or server_root
            target = proxies[0][0] if proxies else ''
            for key, value in global_vars.items():
                target = target.replace(key, value)
            host = urllib.parse.urlsplit(target if '://' in target else 'http://' + target).hostname if target else ''
            route_type = 'proxy' if proxies else 'redirect' if returns else 'static' if roots else 'other'
            destinations = aliases.get(host, [])
            for origin in origins or ['']:
                url = origin + path if origin and path.startswith('/') and not re.search(r'\$[a-zA-Z_]', path) and (len(loc) < 3 or loc[1] in ('=', '^~')) else None
                routes.append({'gateway': container['Name'].lstrip('/'), 'path': path,
                               'match': ' '.join(loc[1:]), 'url': url,
                               'target': target or (' '.join(returns[0]) if returns else roots[0][0] if roots else ''),
                               'kind': route_type, 'services': destinations,
                               'hostnames': sum(values(server, 'server_name'), []),
                               'rewrite': [' '.join(v) for v in values(body, 'rewrite')]})
    return routes


def probe(url):
    # Only read a route once; redirects are reported without following them.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None
    opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=ssl._create_unverified_context()))
    try:
        with opener.open(urllib.request.Request(url, headers={'User-Agent': 'Local-Service-Directory/1'}), timeout=3) as response:
            return {'status': response.status, 'state': 'responding'}
    except urllib.error.HTTPError as exc:
        return {'status': exc.code, 'state': 'restricted' if exc.code in (401, 403) else 'responding' if exc.code < 400 else 'error' if exc.code >= 500 else 'no page'}
    except (OSError, urllib.error.URLError):
        return {'status': None, 'state': 'unreachable'}


def collect():
    ids = command(['docker', 'ps', '-q']).split()
    containers = json.loads(command(['docker', 'inspect', *ids])) if ids else []
    aliases = {}
    for c in containers:
        for network in c['NetworkSettings']['Networks'].values():
            for alias in [c['Name'].lstrip('/'), network.get('IPAddress'), *(network.get('Aliases') or [])]:
                if alias:
                    names = aliases.setdefault(alias, [])
                    if c['Name'].lstrip('/') not in names:
                        names.append(c['Name'].lstrip('/'))
    routes, warnings = [], []
    for c in containers:
        if 'nginx' not in c['Config']['Image'] and not any(m['Destination'].endswith('nginx.conf') for m in c['Mounts']):
            continue
        try:
            routes.extend(routes_from_config(command(['docker', 'exec', c['Name'].lstrip('/'), 'nginx', '-T']), c, aliases))
        except (RuntimeError, subprocess.TimeoutExpired, ValueError):
            warnings.append(f'Could not inspect routes for {c["Name"].lstrip("/")}')
    services = []
    for c in containers:
        name = c['Name'].lstrip('/')
        published = []
        for port, bindings in (c['NetworkSettings'].get('Ports') or {}).items():
            for b in bindings or []:
                item = {'port': port, 'hostPort': b['HostPort'], 'bind': b['HostIp']}
                if port.endswith('/tcp') and not any(x['hostPort'] == item['hostPort'] for x in published):
                    published.append(item)
        image = c['Config']['Image']
        category = 'Gateway' if 'nginx' in image and 'gateway' in name else 'Database' if any(x in image for x in ('postgres', 'cockroach', 'redis', 'mysql')) else 'Background' if 'replication' in name else 'Tool' if 'selenium' in image else 'Identity' if ('pidp-dev' in name or 'identity-api' in name) else 'API' if name.endswith(('-org', '-chat', '-community-api', '-chat-api')) else 'Website'
        links = [{'label': r['path'], 'url': r['url']} for r in routes if name in r['services'] and r['url']]
        if category == 'API':
            for route in routes:
                if name not in route['services'] or not route['url']:
                    continue
                base = route['url'].rstrip('/')
                links.append({'label': 'Health', 'url': base + '/health'})
                if name.endswith(('-org', '-community-api')):
                    links.append({'label': 'MCP', 'url': base + '/mcp'})
                    links.append({'label': 'Replica status', 'url': base + '/api/network/replication/status'})
        if not links:
            links = [{'label': r['path'], 'url': r['url']} for r in routes if r['gateway'] == name and r['url']]
        if not links and category not in ('Database', 'Background'):
            for p in published:
                if p['port'] in ('5900/tcp', '9000/tcp'):
                    continue
                tls = p['port'] in ('443/tcp', '8443/tcp') or name in ('medtech-website', 'lifetech-website-preview', 'lifetech-website') or name.startswith('bmoremedtech-') and name.endswith(('-site', '-test'))
                links.append({'label': 'Open', 'url': f'{"https" if tls else "http"}://localhost:{p["hostPort"]}/'})
        # Host-network HTTP servers have no Docker port bindings.
        args = c['Config'].get('Cmd') or []
        if c['HostConfig']['NetworkMode'] == 'host' and 'http.server' in args:
            index = args.index('http.server') + 1
            if index < len(args) and args[index].isdigit():
                links.append({'label': 'Open', 'url': f'http://localhost:{args[index]}/'})
        links = list({link['url']: link for link in links}.values())
        services.append({'name': name, 'image': image, 'category': category,
                         'state': c['State']['Status'], 'health': (c['State'].get('Health') or {}).get('Status'),
                         'startedAt': c['State']['StartedAt'], 'networks': list(c['NetworkSettings']['Networks']),
                         'ports': published, 'links': links,
                         'internalPorts': sorted((c['Config'].get('ExposedPorts') or {}).keys()),
                         'routed': any(name in r['services'] or name == r['gateway'] for r in routes),
                         'note': 'No HTTP page; runs scheduled replication.' if category == 'Background' else 'Internal database; no browser interface.' if category == 'Database' else ''})
    urls = {r['url'] for r in routes if r['url']} | {l['url'] for s in services for l in s['links']}
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        checks = dict(zip(sorted(urls), pool.map(probe, sorted(urls))))
    for route in routes:
        route['check'] = checks.get(route['url'])
    for service in services:
        for link in service['links']:
            link['check'] = checks.get(link['url'])
    order = {name: index for index, name in enumerate(['Website', 'Gateway', 'Identity', 'API', 'Database', 'Background', 'Tool'])}
    return {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'refreshSeconds': 30, 'services': sorted(services, key=lambda s: (order[s['category']], s['name'])),
            'routes': sorted(routes, key=lambda r: (r['gateway'], r['path'])), 'warnings': warnings,
            'scope': 'Running Docker containers and active container NGINX configuration. Host processes and cloud deployments are outside this inventory.'}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    result = collect()
    with tempfile.NamedTemporaryFile(mode='w', dir=OUTPUT, suffix='.tmp', delete=False) as stream:
        json.dump(result, stream, indent=2)
        stream.write('\n')
        temporary = Path(stream.name)
    temporary.chmod(0o644)
    os.replace(temporary, OUTPUT / 'inventory.json')
    print(f'Inventoried {len(result["services"])} services and {len(result["routes"])} NGINX routes.')


if __name__ == '__main__':
    main()
