#!/usr/bin/env python3
"""First visible organization frame must already carry its brand, even on slow reloads."""
import json,os,time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:19458').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1']
light={'primary':'#123456','surface':'#FFFFFF','panel':'#FFFFFF','text-primary':'#111111'}
dark={'primary':'#ABCDEF','surface':'#112233','panel':'#112233','text-primary':'#FFFFFF'}
site={'id':'paint-company-site','organization_id':'paint-company','hostname':'paint-company.example','name':'Paint Company','tagline':'Synthetic brand check','profile':'community','features':[],'home_org_slug':'paint-company','brand_image_path':'/orgportal.svg','feature_config':{'brandThemes':{'defaultTheme':'company','themes':[{'id':'company','name':'Company','light':light,'dark':dark,'imagery':{'icon':'/images/organization-themes/ankhtech-icon.webp','avatar':'/images/organization-themes/ankhtech-avatar.webp','background':'/images/organization-themes/ankhtech-background.webp'}}]}}}
org={'id':'paint-company','slug':'paint-company','name':'Paint Company','image_url':'/orgportal.svg','description':'Synthetic first-paint fixture','tags':[],'links':[],'membership_count':0}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 c=browser.new_context(ignore_https_errors=True)
 c.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in ['localhost','127.0.0.1'] else route.abort())
 def data(route):
  path=urlparse(route.request.url).path
  if path.endswith('/branding'):time.sleep(.8);value={'portal':site}
  elif path.endswith('/paint-company'):value=org
  else:value=[]
  route.fulfill(json=value)
 c.route('**/api/org/api/network/orgs/public/paint-company**',data)
 c.add_init_script("""window.brandFrames=[];function sample(){const node=document.querySelector('.organization-profile');if(node&&node.getBoundingClientRect().height)window.brandFrames.push({brand:node.getAttribute('data-brand-theme'),icon:node.querySelector('.organization-profile-avatar img')?.getAttribute('src')});requestAnimationFrame(sample)}requestAnimationFrame(sample);""")
 page=c.new_page()
 for n in range(2):
  page.goto(base+'/orgs/paint-company?tab=branding')
  expect(page.get_by_role('heading',name='Paint Company',exact=True)).to_be_visible(timeout=30000)
  page.wait_for_timeout(100)
  frames=page.evaluate('window.brandFrames')
  assert frames and all(f['brand']=='configured' for f in frames),frames[:5]
  assert all('ankhtech-icon.webp' in f['icon'] for f in frames),frames[:5]
 print('PASS: delayed organization branding, cold load and reload contain no unbranded organization frames')
 browser.close()
