import unittest
from collect import routes_from_config


class RoutingTests(unittest.TestCase):
    def test_expanded_nginx_routes_include_variable_upstreams_and_static_sites(self):
        config = '''events {} http { server { listen 8443 ssl; root /site;
        location /api/ { set $backend app:8001; rewrite ^/api/(.*)$ /$1 break; proxy_pass http://$backend; }
        location = /login { return 302 /pidp/; }
        location ~ \\.php$ { fastcgi_pass app:9000; }
        location / { try_files $uri =404; }
        } }'''
        container = {'Name': '/gateway', 'NetworkSettings': {'Ports': {'8443/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '8444'}]}}}
        routes = routes_from_config(config, container, {'app': ['api-container']})
        by_path = {r['path']: r for r in routes}
        self.assertEqual(by_path['/api/']['target'], 'http://app:8001')
        self.assertEqual(by_path['/api/']['url'], 'https://localhost:8444/api/')
        self.assertEqual(by_path['/api/']['services'], ['api-container'])
        self.assertEqual(by_path['/']['kind'], 'static')
        self.assertEqual(by_path['/login']['kind'], 'redirect')
        self.assertEqual(len(routes), 4)
        self.assertIsNone(next(r for r in routes if 'php' in r['path'])['url'])

    def test_unpublished_nginx_route_stays_visible_without_broken_browser_link(self):
        c = {'Name': '/private', 'NetworkSettings': {'Ports': {}}}
        routes = routes_from_config('http { server { listen 8080; location / { proxy_pass http://hidden:9000; } } }', c, {})
        self.assertEqual(len(routes), 1)
        self.assertIsNone(routes[0]['url'])
        self.assertEqual(routes[0]['target'], 'http://hidden:9000')


if __name__ == '__main__':
    unittest.main()
