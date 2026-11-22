"""Read-only local EcoMap clickthrough and desktop/mobile layout captures."""
import json, os, pathlib
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
from PIL import Image, ImageDraw

base = os.environ.get('PLAYWRIGHT_BASE_URL', 'https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost', '127.0.0.1', '::1']
out = pathlib.Path(__file__).resolve().parents[2] / 'artifacts/layout-review/organization-ecomap'
out.mkdir(parents=True, exist_ok=True)
shots = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
    for theme in ['light', 'dark']:
        for width in [1440, 390]:
            ctx = browser.new_context(ignore_https_errors=True, viewport={'width': width, 'height': 1100}, color_scheme=theme)
            ctx.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in ['localhost', '127.0.0.1', '::1'] and route.request.method in ['GET', 'HEAD', 'OPTIONS'] else route.abort())
            ctx.add_init_script('localStorage.setItem("orgportal.theme",' + json.dumps(theme) + ')')
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base + '/orgs/state-of-maryland', wait_until='domcontentloaded')
            section = page.get_by_role('region', name='EcoMap for State of Maryland', exact=True)
            expect(section.locator('canvas')).to_be_visible(timeout=60000)
            expect(section.get_by_role('status')).to_contain_text('All ')
            response = ctx.request.get(base + '/api/ecosystem/organization-map?org=state-of-maryland&limit=250')
            assert response.ok, response.status
            data = response.json()
            assert data['total'] >= 80, data['total']
            assert data['anchor'] == 'research-state-maryland'
            expect(section.locator('canvas')).to_have_attribute('aria-label', f"State of Maryland and all {data['total']} adjacent nodes")
            expect(section.get_by_role('link', name='Open full EcoMap')).to_have_attribute('href', '/ecosystem/network?org=research-state-maryland&direction=both&depth=1')
            about = page.get_by_role('heading', name='About State of Maryland', exact=True)
            assert section.bounding_box()['y'] < about.bounding_box()['y']
            section.get_by_label('Find a node').fill('Comptroller')
            section.locator('.organization-ecomap-search').get_by_role('button', name='Comptroller of Maryland', exact=True).click()
            comptroller = next(node for node in data['organizations'] if node['name'] == 'Comptroller of Maryland')
            profile = page.get_by_role('region', name='EcoMap for Comptroller of Maryland', exact=True)
            expect(profile.locator('canvas')).to_have_attribute('data-ready', 'true', timeout=60000)
            assert __import__('urllib.parse',fromlist=['unquote']).unquote(urlparse(page.url).path).endswith(comptroller['id'])
            expect(profile.get_by_label('Map mode', exact=True)).to_have_value('2d')
            profile.get_by_label('Find a node').fill('State of Maryland')
            profile.locator('.organization-ecomap-search').get_by_role('button', name='State of Maryland', exact=True).click()
            expect(section.locator('canvas')).to_have_attribute('data-ready', 'true', timeout=60000)
            surface = section.locator('canvas')
            before = surface.evaluate('(canvas)=>canvas.toDataURL()')
            section.get_by_role('button', name='Zoom in on organization map', exact=True).click()
            page.wait_for_function('(old)=>document.querySelector(".organization-ecomap canvas").toDataURL()!==old', arg=before)
            bounds = surface.bounding_box()
            before = surface.evaluate('(canvas)=>canvas.toDataURL()')
            page.mouse.move(bounds['x'] + 40, bounds['y'] + 80)
            page.mouse.down()
            page.mouse.move(bounds['x'] + 100, bounds['y'] + 120, steps=4)
            page.mouse.up()
            page.wait_for_function('(old)=>document.querySelector(".organization-ecomap canvas").toDataURL()!==old', arg=before)
            section.get_by_role('button', name='Fit all connections', exact=True).click()
            expect(section.locator('.organization-ecomap-labels button.focus').filter(has_text='State of Maryland')).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), f'Overflow {width}/{theme}'
            shot = out / f'map-{width}-{theme}.png'
            section.screenshot(path=str(shot))
            shots.append(shot)
            # Follow the map's organization link, exercising client-side tenant changes.
            section.get_by_label('Find a node').fill('TEDCO')
            section.locator('.organization-ecomap-search').get_by_role('button', name='TEDCO', exact=True).click()
            tedco = page.get_by_role('region', name='EcoMap for TEDCO', exact=True)
            expect(tedco.locator('canvas')).to_be_visible(timeout=30000)
            expect(tedco.locator('canvas')).to_have_attribute('aria-label', __import__('re').compile('^TEDCO and all '))
            expect(page.get_by_role('region', name='EcoMap for State of Maryland', exact=True)).to_have_count(0)
            expect(tedco.locator('.organization-ecomap-selected')).to_have_count(0)
            assert not errors, errors
            print(f'PASS {width}/{theme}: {data["total"]} neighbors, search, zoom, pan, fit, organization navigation, no errors or overflow')
            ctx.close()
    browser.close()
contact = Image.new('RGB', (1500, 1800), '#e6edf0')
for index, path in enumerate(shots):
    picture = Image.open(path).convert('RGB')
    picture.thumbnail((720, 830))
    x, y = (index % 2) * 750 + 15, (index // 2) * 900 + 40
    ImageDraw.Draw(contact).text((x, y - 25), path.name, fill='black')
    contact.paste(picture, (x, y))
contact.save(out / 'contact.png')
print(out)
