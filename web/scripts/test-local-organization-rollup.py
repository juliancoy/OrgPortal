"""Read-only local checks for government rollups and downstream departments."""
import json, math, os, pathlib
from urllib.parse import urlparse, urlencode
from playwright.sync_api import sync_playwright, expect

base = os.environ.get('PLAYWRIGHT_BASE_URL', 'https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost', '127.0.0.1', '::1']
out = pathlib.Path(__file__).resolve().parents[2] / 'artifacts/layout-review/organization-rollup'
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = browser.new_context(ignore_https_errors=True, locale='en-US',
        viewport={'width': 1400, 'height': 1100}, reduced_motion='reduce')
    ctx.route('**/*', lambda r: r.continue_() if urlparse(r.request.url).hostname in
        ['localhost', '127.0.0.1', '::1'] and r.request.method in ['GET', 'HEAD', 'OPTIONS'] else r.abort())
    ctx.add_init_script('''window.mapCircles=[];const arc=Path2D.prototype.arc;
        Path2D.prototype.arc=function(x,y,r,...rest){window.mapCircles.push({x,y,r});if(window.mapCircles.length>500)window.mapCircles.shift();return arc.call(this,x,y,r,...rest)};''')
    def query(section, org='state-of-maryland', fy='2025', limit=100):
        response = ctx.request.get(base+'/api/ecosystem/'+section+'?'+urlencode({'org': org, 'fy': fy, 'limit': limit}))
        assert response.ok, response.text()
        return response.json()
    evidence = query('organization-evidence')
    assert len(evidence['financialMembers']) > 22
    state = evidence['organization']['id']
    departments = [n for n in evidence['children'] if n['classification'] == 'department']
    neighborhood = query('organization-map', limit=250)
    assert neighborhood['nextOffset'] is None
    edges = neighborhood['relationships']
    assert all(any(e.get('hierarchy') and e['source'] == state and e['target'] == d['id'] and e['recordCount'] == 0
        for e in edges) for d in departments)
    anchor = next(n for n in neighborhood['organizations'] if n['id'] == state)
    usd = next(t for t in evidence['financialTotals']['currencies'] if t['currency'] == 'USD')
    assert math.isclose(anchor['financialAmount'], usd['received']+usd['disbursed'], abs_tol=.01)
    assert anchor['financialAmount'] == max(n['financialAmount'] or 0 for n in neighborhood['organizations'])
    health = next(n for n in departments if n['name'].endswith('Department of Health'))
    health_map = query('organization-map', org=health['id'], limit=250)
    assert next(n for n in health_map['organizations'] if n['id'] == state)['financialAmount'] == anchor['financialAmount']
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    def ready(mode='2d', selected=state):
        page.locator(f'.organization-ecomap canvas[data-mode="{mode}"][data-ready="true"][data-anchor="{selected}"]').wait_for(timeout=60000)
        page.wait_for_function('()=>{const c=document.querySelector(".organization-ecomap canvas");return c?.dataset.ready==="true"&&!c.dataset.transitioning}')
    page.goto(base+'/ecosystem/organizations/state-of-maryland', wait_until='domcontentloaded')
    ready()
    page.get_by_label('Color by', exact=True).select_option('volume')
    page.evaluate('window.mapCircles=[]')
    page.get_by_role('button', name='Fit all connections', exact=True).click()
    page.wait_for_function('mapCircles.length>90')
    circles = page.evaluate('mapCircles')
    center_radius = min(c['r'] for c in circles if c['x']==0 and c['y']==0)
    assert center_radius > max(c['r'] for c in circles if c['x']!=0 or c['y']!=0)
    expect(page.get_by_label('Fiscal year', exact=True)).to_have_value('2025')
    totals = page.get_by_role('region', name='Recorded financial totals', exact=True)
    expect(totals).to_contain_text('Consolidated across '+str(len(evidence['financialMembers']))+' organizations')
    for i, direction in enumerate(['received', 'disbursed']):
        expect(totals.locator('dd').nth(i)).to_contain_text('USD\xa0'+format(usd[direction], ',.2f'))
    for fy in ['2024', 'all', '2025']:
        page.get_by_label('Fiscal year', exact=True).select_option(fy)
        expected = query('organization-evidence', fy=fy)
        amount = next(t for t in expected['financialTotals']['currencies'] if t['currency']=='USD')['disbursed']
        expect(totals.locator('dd').nth(1)).to_contain_text('USD\xa0'+format(amount, ',.2f'), timeout=60000)
        ready()
    for mode in ['2d', '3d']:
        page.get_by_label('Map mode', exact=True).select_option(mode)
        ready(mode)
        page.get_by_label('Color by', exact=True).select_option('volume')
        for theme, width in [('light',1400), ('dark',390)]:
            page.evaluate('(theme)=>document.documentElement.dataset.theme=theme', theme)
            page.set_viewport_size({'width':width,'height':1100})
            page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
            page.get_by_role('button', name='Fit all connections', exact=True).click()
            page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
            page.locator('.organization-ecomap').screenshot(path=str(out/f'state-{mode}-{theme}-{width}.png'))
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.set_viewport_size({'width':1400,'height':1100})
        page.get_by_label('Find a node', exact=True).fill(health['name'])
        page.locator('.organization-ecomap-search').get_by_role('button',name=health['name'],exact=True).click()
        ready(mode,health['id'])
        page.locator('.organization-ecomap-labels').get_by_role('button',name=health['name'],exact=True).click()
        ready(mode)
        expect(page.get_by_label('Fiscal year',exact=True)).to_have_value('2025')
    page.get_by_label('Title placement', exact=True).select_option('surface')
    page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    page.get_by_role('button', name='Fit all connections', exact=True).click()
    for _ in range(3):
        page.get_by_role('button', name='Zoom in on organization map', exact=True).click()
        page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    page.wait_for_function('Number(document.querySelector(".organization-ecomap canvas")?.dataset.sphereTitles)>0', timeout=60000)
    expect(page.locator('.organization-ecomap-labels button:visible')).to_have_count(0)
    page.locator('.organization-ecomap-canvas').screenshot(path=str(out/'state-3d-surface.png'))
    assert not errors, errors
    browser.close()
print(json.dumps({'result':'pass','fiscalYear':2025,'scopeOrganizations':len(evidence['financialMembers']),
    'departments':len(departments),'receivedUsd':usd['received'],'disbursedUsd':usd['disbursed'],
    'stateIsLargest':True,'checks':'consolidated cards and map agree; all departments downstream; fiscal years; 2D/3D parent navigation; mobile/desktop light/dark; no browser errors'}))
print(out)
