"""Read-only local browser profile; save network, main-thread and idle CPU evidence."""
import json, os, pathlib, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

base = os.environ.get('PLAYWRIGHT_BASE_URL', 'https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost', '127.0.0.1', '::1']
label = os.environ.get('PROFILE_LABEL', 'baseline')
out = pathlib.Path(__file__).resolve().parents[2] / 'artifacts/performance/organization-map' / label
out.mkdir(parents=True, exist_ok=True)
target = '/ecosystem/organizations/source-label%3Amaryland_comptroller%3Aagency%3A14aa88b77dfd301a1a96d03621dbdb9e'
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = browser.new_context(ignore_https_errors=True, viewport={'width': 1400, 'height': 1100})
    context.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in ['localhost', '127.0.0.1', '::1'] and route.request.method in ['GET', 'HEAD', 'OPTIONS'] else route.abort())
    context.add_init_script('''performance.setResourceTimingBufferSize(10000);window.longTasks=[];new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push({start:e.startTime,duration:e.duration})}).observe({type:'longtask',buffered:true});window.mapReadyAt=null;new MutationObserver(()=>{if(!window.mapReadyAt&&document.querySelector('.organization-ecomap canvas[data-ready="true"]'))window.mapReadyAt=performance.now()}).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['data-ready']});''')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    cdp = context.new_cdp_session(page)
    cdp.send('Performance.enable')
    cdp.send('Profiler.enable')
    cdp.send('Profiler.start')
    page.goto(base + target, wait_until='domcontentloaded', timeout=120000)
    page.locator('.organization-ecomap canvas[data-ready="true"]').wait_for(timeout=120000)
    profile = cdp.send('Profiler.stop')['profile']
    (out / 'load.cpuprofile').write_text(json.dumps(profile))
    metrics = lambda: {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
    before = metrics()
    page.wait_for_timeout(5000)
    after = metrics()
    result = page.evaluate('''()=>({url:location.href,title:document.title,mapReadyMs:mapReadyAt,paint:performance.getEntriesByType('paint').map(e=>({name:e.name,ms:e.startTime})),longTasks,requests:performance.getEntriesByType('resource').map(e=>({name:e.name,start:e.startTime,duration:e.duration,bytes:e.encodedBodySize})),status:document.querySelector('.organization-ecomap [role="status"]')?.textContent,labels:document.querySelectorAll('.organization-ecomap-labels button').length})''')
    result.update(metrics=after, idleSeconds=after['Timestamp']-before['Timestamp'], idleTaskSeconds=after['TaskDuration']-before['TaskDuration'], errors=errors)
    # Self-time is sampled, not wall time; keep the raw profile for inspection.
    nodes = {n['id']: n['callFrame'] for n in profile['nodes']}
    totals = {}
    for node, duration in zip(profile.get('samples', []), profile.get('timeDeltas', [])):
        frame = nodes[node]
        key = (frame['functionName'], frame['url'], frame['lineNumber'])
        totals[key] = totals.get(key, 0) + duration / 1000
    result['cpuTop'] = [dict(function=k[0], url=k[1], line=k[2]+1, ms=round(v, 1)) for k,v in sorted(totals.items(), key=lambda item: -item[1])[:25]]
    assert '2,527 adjacent nodes' in result['status'], result['status']
    assert not errors, errors
    if os.environ.get('PROFILE_3D') == '1':
        started = time.monotonic()
        before3d = metrics()
        page.get_by_label('Map mode', exact=True).select_option('3d')
        page.locator('.organization-ecomap canvas[data-mode="3d"][data-ready="true"]').wait_for(timeout=60000)
        result['threeD'] = {'readyMs': (time.monotonic()-started)*1000, 'rendering': 'headless SwiftShader software WebGL2'}
        ready3d = metrics()
        page.wait_for_timeout(5000)
        idle3d = metrics()
        result['threeD'].update(taskSeconds=ready3d['TaskDuration']-before3d['TaskDuration'], idleSeconds=idle3d['Timestamp']-ready3d['Timestamp'], idleTaskSeconds=idle3d['TaskDuration']-ready3d['TaskDuration'], heapBytes=idle3d['JSHeapUsedSize'])
        assert not errors, errors
    (out / 'result.json').write_text(json.dumps(result, indent=2))
    page.locator('.organization-ecomap').screenshot(path=str(out / 'map.png'))
    print(json.dumps({k:v for k,v in result.items() if k not in ['requests','longTasks']}, indent=2))
    print('API requests:', json.dumps([r for r in result['requests'] if '/api/' in r['name']], indent=2))
    print('Long tasks:', json.dumps(result['longTasks']))
    browser.close()
