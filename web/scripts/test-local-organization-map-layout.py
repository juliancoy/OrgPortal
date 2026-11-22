"""Local read-only regression for worker failure, cancellation and label navigation."""
import os
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect

base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1400,'height':1100})
 ctx.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname in ['localhost','127.0.0.1','::1'] and r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
 ctx.add_init_script('''
 window.layoutWorkers=0;const NativeWorker=Worker;
 window.Worker=class extends NativeWorker{
  constructor(...args){super(...args);this.live=true;layoutWorkers++}
  terminate(){if(this.live){layoutWorkers--;this.live=false}super.terminate()}
  postMessage(message){
   if(window.failLayout){window.failLayout=false;queueMicrotask(()=>this.dispatchEvent(new Event('error')));return}
   if(window.holdLayout)return;
   super.postMessage(message)
  }
 };
 ''')
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 target='/ecosystem/organizations/source-label%3Amaryland_comptroller%3Aagency%3A14aa88b77dfd301a1a96d03621dbdb9e'
 def ready(mode):page.locator(f'.organization-ecomap canvas[data-mode="{mode}"][data-ready="true"]').wait_for(timeout=60000)
 page.goto(base+target,wait_until='domcontentloaded');ready('2d')
 assert page.evaluate('layoutWorkers')==0
 # A pending expensive layout can be cancelled without freezing the controls.
 page.evaluate('window.holdLayout=true');page.get_by_label('Map mode',exact=True).select_option('3d')
 expect(page.locator('.organization-ecomap canvas')).to_have_attribute('data-layout-pending','true')
 assert page.evaluate('layoutWorkers')==1
 page.get_by_label('Map mode',exact=True).select_option('2d');ready('2d')
 assert page.evaluate('layoutWorkers')==0
 # Retry creates fresh work and recovers after an actual worker error event.
 page.evaluate('window.holdLayout=false;window.failLayout=true')
 page.get_by_label('Map mode',exact=True).select_option('3d')
 expect(page.locator('.organization-ecomap').get_by_role('alert')).to_contain_text('Could not arrange')
 assert page.evaluate('layoutWorkers')==0
 page.get_by_role('button',name='Retry layout',exact=True).click();ready('3d')
 assert page.evaluate('layoutWorkers')==0
 # Pooled DOM labels still route to their current node, retaining the renderer.
 page.evaluate('window.originalCanvas=document.querySelector(".organization-ecomap canvas")')
 label=page.locator('.organization-ecomap-labels button:not(.focus):visible').first
 node=label.get_attribute('data-node-id');assert node
 label.click()
 canvas=page.locator('.organization-ecomap canvas')
 expect(canvas).to_have_attribute('data-anchor',node,timeout=60000);ready('3d')
 page.wait_for_function('!document.querySelector(".organization-ecomap canvas").dataset.transitioning')
 assert page.evaluate('originalCanvas===document.querySelector(".organization-ecomap canvas")')
 assert page.evaluate('performance.getEntriesByType("navigation").length')==1
 # Dispose while Control is held: both capture listeners must leave the document.
 cdp=ctx.new_cdp_session(page)
 def keyboard_listeners():
  handle=cdp.send('Runtime.evaluate',{'expression':'document','objectGroup':'listeners'})['result']['objectId']
  listeners=cdp.send('DOMDebugger.getEventListeners',{'objectId':handle})['listeners']
  cdp.send('Runtime.releaseObjectGroup',{'objectGroup':'listeners'})
  return sum(e['type'] in ['keydown','keyup'] for e in listeners)
 count=keyboard_listeners();canvas.focus();page.keyboard.down('Control')
 page.get_by_label('Map mode',exact=True).select_option('2d');ready('2d');page.keyboard.up('Control')
 page.get_by_label('Map mode',exact=True).select_option('3d');ready('3d')
 assert keyboard_listeners()==count
 assert not errors,errors
 browser.close()
print('PASS: pending layout cancellation, worker failure/retry, worker termination, pooled-label navigation without canvas reload, Control-held renderer cleanup')
