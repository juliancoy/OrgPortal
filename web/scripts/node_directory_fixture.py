"""Directory endpoint for isolated browser fixtures; never uses real account data."""
from urllib.parse import urlparse, parse_qs
import unicodedata

def install_node_directory_fixture(context, nodes=()):
    directory = {node['id']: node for node in nodes}
    def collect(response):
        if urlparse(response.url).path != '/api/ecosystem/organization-map':
            return
        assert urlparse(response.url).hostname in ['localhost', '127.0.0.1', '::1']
        data = response.json()
        for node in data.get('organizations', []):
            directory[node['id']] = node
    context.on('response', collect)
    def search(route):
        params = parse_qs(urlparse(route.request.url).query)
        normalize = lambda value: unicodedata.normalize('NFKC', value).lower().strip()
        query = normalize(params.get('q', [''])[0])
        offset = int(params.get('offset', ['0'])[0])
        limit = int(params.get('limit', ['20'])[0])
        rows = sorted(({'id': n['id'], 'name': n['name'], 'type': n.get('type', 'Organization')}
                       for n in directory.values() if query in normalize(n['name']+' '+n.get('type', ''))),
                      key=lambda n: (n['name'], n['id']))
        node_total = len(rows)
        if params.get('group') == ['name']:
            groups = {}
            for node in rows:
                key = ' '.join(normalize(node['name']).split())
                if key not in groups:
                    groups[key] = {**node, 'members': []}
                groups[key]['members'].append(node)
            rows = list(groups.values())
        route.fulfill(json={'version': 'node-directory-fixture', 'groupedBy': 'name', 'nodeTotal': node_total, 'records': rows[offset:offset+limit],
                            'total': len(rows), 'offset': offset,
                            'nextOffset': offset+limit if offset+limit<len(rows) else None})
    context.route('**/api/ecosystem/organizations?*', search)
