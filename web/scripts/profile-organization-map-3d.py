"""Read-only 3D startup, idle, navigation and renderer lifecycle measurements."""
import json, os, pathlib, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

base = os.environ.get('PLAYWRIGHT_BASE_URL', 'https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost', '127.0.0.1', '::1']
backend = os.environ.get('PROFILE_GPU', 'hardware')
sampling = os.environ.get('PROFILE_CPU', '1') != '0'
out = pathlib.Path(__file__).resolve().parents[2]/'artifacts/performance/organization-map-3d'/os.environ.get('PROFILE_LABEL', backend)
out.mkdir(parents=True, exist_ok=True)
target = '/ecosystem/organizations/source-label%3Amaryland_comptroller%3Aagency%3A14aa88b77dfd301a1a96d03621dbdb9e'
instrument = '''
performance.setResourceTimingBufferSize(10000);
window.profile3d={frames:[],longTasks:[],calls:0,triangles:0,contexts:0,contextLosses:0,resources:{}};
new PerformanceObserver(list=>{for(const e of list.getEntries())profile3d.longTasks.push({start:e.startTime,ms:e.duration})}).observe({type:'longtask',buffered:true});
const request=window.requestAnimationFrame;
window.requestAnimationFrame=function(callback){return request.call(window,function(now){
 const started=performance.now(),calls=profile3d.calls,triangles=profile3d.triangles;
 try{return callback(now)}finally{if(profile3d.calls>calls)profile3d.frames.push({start:started,ms:performance.now()-started,calls:profile3d.calls-calls,triangles:profile3d.triangles-triangles})}
})};
const nativeContext=HTMLCanvasElement.prototype.getContext;
const seen=new WeakSet();
HTMLCanvasElement.prototype.getContext=function(...args){const context=nativeContext.apply(this,args);if(context&&args[0]==='webgl2'&&!seen.has(context)){seen.add(context);profile3d.contexts++;const ext=context.getExtension('WEBGL_debug_renderer_info');profile3d.renderer=ext?context.getParameter(ext.UNMASKED_RENDERER_WEBGL):context.getParameter(context.RENDERER)}return context};
const draw=WebGL2RenderingContext.prototype.drawElementsInstanced;
WebGL2RenderingContext.prototype.drawElementsInstanced=function(mode,count,type,offset,instances){profile3d.calls++;if(mode===this.TRIANGLES)profile3d.triangles+=count/3*instances;return draw.apply(this,arguments)};
const extension=WebGL2RenderingContext.prototype.getExtension,wrappedExtensions=new WeakSet();
WebGL2RenderingContext.prototype.getExtension=function(name){const result=extension.apply(this,arguments);if(name==='WEBGL_lose_context'&&result&&!wrappedExtensions.has(result)){wrappedExtensions.add(result);const lose=result.loseContext;result.loseContext=function(){profile3d.contextLosses++;return lose.apply(this,arguments)}}return result};
for(const kind of ['Buffer','Texture','Program','Shader','Framebuffer','Renderbuffer','VertexArray']){
 const created=new WeakSet(),deleted=new WeakSet(),create=WebGL2RenderingContext.prototype['create'+kind],remove=WebGL2RenderingContext.prototype['delete'+kind];
 profile3d.resources[kind]={created:0,deleted:0};
 WebGL2RenderingContext.prototype['create'+kind]=function(...args){const value=create.apply(this,args);if(value&&!created.has(value)){created.add(value);profile3d.resources[kind].created++}return value};
 WebGL2RenderingContext.prototype['delete'+kind]=function(value){if(value&&created.has(value)&&!deleted.has(value)){deleted.add(value);profile3d.resources[kind].deleted++}return remove.apply(this,arguments)};
}
'''

def profile_top(profile):
    frames = {node['id']: node['callFrame'] for node in profile['nodes']}
    totals = {}
    for node, duration in zip(profile.get('samples', []), profile.get('timeDeltas', [])):
        frame = frames[node]; key = (frame['functionName'], frame['url'], frame['lineNumber']+1)
        totals[key] = totals.get(key, 0)+duration/1000
    return [dict(function=k[0], url=k[1], line=k[2], ms=round(v,2)) for k,v in sorted(totals.items(), key=lambda item:-item[1])[:15]]

with sync_playwright() as p:
    args = ['--no-sandbox'] + (['--enable-gpu', '--use-angle=gl'] if backend == 'hardware' else ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=args)
    browser_cdp = browser.new_browser_cdp_session()
    gpu = browser_cdp.send('SystemInfo.getInfo')['gpu']
    context = browser.new_context(ignore_https_errors=True, viewport={'width':1400,'height':1100})
    context.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in ['localhost','127.0.0.1','::1'] and route.request.method in ['GET','HEAD','OPTIONS'] else route.abort())
    context.add_init_script(instrument)
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    cdp=context.new_cdp_session(page);cdp.send('Performance.enable');cdp.send('Profiler.enable')
    metrics=lambda:{m['name']:m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
    gpu_cpu=lambda:sum(process['cpuTime'] for process in browser_cdp.send('SystemInfo.getProcessInfo')['processInfo'] if process['type']=='GPU')
    page.goto(base+target,wait_until='domcontentloaded',timeout=120000)
    page.locator('.organization-ecomap canvas[data-mode="2d"][data-ready="true"]').wait_for(timeout=60000)
    result={'gpu':gpu,'cpuSampling':sampling,'stages':{},'errors':errors}
    def stage(name,action):
        start=page.evaluate('performance.now()');before=metrics();cpu=gpu_cpu()
        if sampling:cdp.send('Profiler.start')
        action()
        profile=cdp.send('Profiler.stop')['profile'] if sampling else None
        end=page.evaluate('performance.now()');after=metrics()
        frames=page.evaluate('(start)=>profile3d.frames.filter(f=>f.start>=start)',start)
        durations=sorted(f['ms'] for f in frames)
        intervals=sorted(frames[i]['start']-frames[i-1]['start'] for i in range(1,len(frames)))
        percentile=lambda values,q:values[min(len(values)-1,int(len(values)*q))] if values else None
        value={'wallMs':end-start,'mainThreadMs':(after['TaskDuration']-before['TaskDuration'])*1000,'gpuProcessCpuMs':(gpu_cpu()-cpu)*1000,'heapMiB':after['JSHeapUsedSize']/1048576,'renderedFrames':len(frames),'renderCallbackP50Ms':percentile(durations,.5),'renderCallbackP95Ms':percentile(durations,.95),'frameIntervalP50Ms':percentile(intervals,.5),'frameIntervalP95Ms':percentile(intervals,.95),'longTasks':page.evaluate('(start)=>profile3d.longTasks.filter(t=>t.start>=start)',start),'cpuTop':profile_top(profile) if profile else []}
        if frames:value['trianglesPerFrame']=max(f['triangles'] for f in frames);value['drawCallsPerFrame']=max(f['calls'] for f in frames)
        result['stages'][name]=value
        if profile:(out/(name+'.cpuprofile')).write_text(json.dumps(profile))
        print(name,json.dumps({k:v for k,v in value.items() if k not in ['cpuTop','longTasks']}),flush=True)
    def ready():page.locator('.organization-ecomap canvas[data-mode="3d"][data-ready="true"]').wait_for(timeout=60000)
    def switch():page.get_by_label('Map mode',exact=True).select_option('3d');ready()
    stage('startup',switch)
    result['renderer']=page.evaluate('profile3d.renderer')
    result['status']=page.locator('.organization-ecomap [role="status"]').first.inner_text()
    result['canvas']=page.locator('.organization-ecomap canvas').evaluate('(canvas)=>({...canvas.dataset,width:canvas.width,height:canvas.height})')
    retention_only=os.environ.get('PROFILE_RETENTION_ONLY')=='1'
    if not retention_only:stage('idle',lambda:page.wait_for_timeout(5000))
    def movement(key):
        canvas=page.locator('.organization-ecomap canvas');canvas.focus()
        before=page.locator('.organization-ecomap-labels').inner_html()
        page.keyboard.down(key);page.wait_for_timeout(3000);page.keyboard.up(key)
        assert page.locator('.organization-ecomap-labels').inner_html()!=before, 'Keyboard did not move the view'
    if not retention_only:
        stage('orbit_d',lambda:movement('d'))
        stage('released',lambda:page.wait_for_timeout(3000))
        page.get_by_role('button',name='Fit all connections',exact=True).click()
        page.get_by_label('Navigation',exact=True).select_option('fly')
        stage('fly_w',lambda:movement('w'))
    page.get_by_role('button',name='Fit all connections',exact=True).click()
    page.keyboard.press('Escape')
    # Explicit GC measures retained JS objects, not GPU memory or leak proof.
    def retained():
        # Request console cleanup before GC. Playwright's isolated-world
        # selector diagnostics may still retain elements; inspect heap paths.
        cdp.send('Runtime.discardConsoleEntries')
        cdp.send('HeapProfiler.collectGarbage')
        document=cdp.send('Runtime.evaluate',{'expression':'document','objectGroup':'retention'})['result']['objectId']
        listeners=cdp.send('DOMDebugger.getEventListeners',{'objectId':document})['listeners']
        cdp.send('Runtime.releaseObjectGroup',{'objectGroup':'retention'})
        return {'heapBytes':metrics()['JSHeapUsedSize'],'dom':cdp.send('Memory.getDOMCounters'),'documentKeyboardListeners':sum(e['type'] in ['keydown','keyup'] for e in listeners),'resources':page.evaluate('profile3d.resources'),'contextLosses':page.evaluate('profile3d.contextLosses')}
    initial=retained();heaps=[]
    for _ in range(3):
        page.get_by_label('Map mode',exact=True).select_option('2d')
        page.locator('.organization-ecomap canvas[data-mode="2d"][data-ready="true"]').wait_for(timeout=60000)
        switch();page.wait_for_timeout(300)
        heaps.append(retained())
    result['retention']={'initial':initial,'afterSwitchCycles':heaps,'contextsCreated':page.evaluate('profile3d.contexts')}
    assert all(h['documentKeyboardListeners']==initial['documentKeyboardListeners'] for h in heaps),'Mode switches retained document keyboard listeners'
    if os.environ.get('PROFILE_HEAP')=='1':
        with (out/'retained.heapsnapshot').open('w') as snapshot:
            cdp.on('HeapProfiler.addHeapSnapshotChunk',lambda event:snapshot.write(event['chunk']))
            cdp.send('HeapProfiler.takeHeapSnapshot')
    result['requests']=page.evaluate("performance.getEntriesByType('resource').map(e=>({url:e.name,start:e.startTime,ms:e.duration,bytes:e.encodedBodySize}))")
    assert '2,527 adjacent nodes' in result['status'],result['status']
    assert not errors,errors
    (out/'result.json').write_text(json.dumps(result,indent=2))
    page.locator('.organization-ecomap').screenshot(path=str(out/'map.png'))
    print('renderer:',result['renderer']);print('retention:',json.dumps(result['retention']))
    browser.close()
