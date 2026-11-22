"""Read-only clickthrough of public evidence on the local Docker portal; no account/session writes."""
import json,os,pathlib
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from PIL import Image,ImageOps,ImageDraw
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-evidence';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 shots=[]
 for theme in ['light','dark']:
  for width in [1440,390]:
   ctx=browser.new_context(ignore_https_errors=True,viewport={'width':width,'height':1000},color_scheme=theme,timezone_id='America/New_York')
   ctx.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in ['localhost','127.0.0.1','::1'] and route.request.method in ['GET','HEAD','OPTIONS'] else route.abort())
   ctx.add_init_script('localStorage.setItem("orgportal.theme",'+json.dumps(theme)+')')
   page=ctx.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(base+'/orgs/state-of-maryland',wait_until='domcontentloaded')
   section=page.get_by_role('region',name='Organization relationships and evidence',exact=True)
   expect(section.get_by_role('heading',name='Departments and agencies',exact=True)).to_be_visible(timeout=60000)
   expect(section.locator('summary').filter(has_text='Departments (24)')).to_be_visible()
   assert section.locator('.organization-evidence-members li').count()==80
   page.locator('summary').filter(has_text='Agencies, offices and branches (51)').click()
   section.get_by_role('button',name='View evidence for Comptroller of Maryland',exact=True).click()
   evidence=section.get_by_role('region',name='Evidence for Comptroller of Maryland',exact=True)
   expect(evidence.get_by_role('heading',name='Evidence for Comptroller of Maryland',exact=True)).to_be_visible(timeout=30000)
   evidence.get_by_label('Evidence type').select_option('transfer')
   expect(evidence.locator('.organization-evidence-list li').first).to_contain_text('MDVIEW',timeout=30000)
   first=evidence.locator('.organization-evidence-list li').first.inner_text()
   evidence.get_by_role('button',name='Next records',exact=True).click()
   expect(evidence.get_by_role('status')).to_contain_text('26–50',timeout=30000)
   assert evidence.locator('.organization-evidence-list li').first.inner_text()!=first
   evidence.get_by_label('Evidence type').select_option('approval')
   expect(evidence.locator('.organization-evidence-list li').first).to_contain_text('BPW',timeout=30000)
   section.get_by_role('button',name='View evidence for Department of Housing & Community Development',exact=True).click()
   housing=section.get_by_role('region',name='Evidence for Department of Housing & Community Development',exact=True)
   expect(housing.get_by_label('Evidence type')).to_be_visible(timeout=30000)
   housing.get_by_label('Evidence type').select_option('approval')
   expect(housing.get_by_role('status')).to_contain_text('of 704 records',timeout=30000)
   housing.get_by_label('Evidence type').select_option('transfer')
   expect(housing.get_by_role('status')).to_contain_text('of 10,529 records',timeout=30000)
   # Capture the component, with selected evidence, in both themes and viewport sizes.
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'Overflow at {width}/{theme}'
   shot=out/f'evidence-{width}-{theme}.png';section.screenshot(path=str(shot));shots.append(shot)
   # Another organization must not inherit the previous organization selection/hierarchy.
   page.goto(base+'/orgs/tedco',wait_until='domcontentloaded')
   expect(page.get_by_role('heading',name='About TEDCO',exact=True)).to_be_visible(timeout=30000)
   expect(page.get_by_role('heading',name='Departments and agencies',exact=True)).to_have_count(0)
   expect(page.get_by_role('heading',name='Evidence for Department of Housing & Community Development',exact=True)).to_have_count(0)
   assert not errors,errors
   ctx.close()
 browser.close()
# Contact sheet of upper relationship sections; full captures retain every evidence row.
thumbs=[]
for path in shots:
 image=Image.open(path).convert('RGB');image=image.crop((0,0,image.width,min(image.height,1800 if image.width>600 else 2600)));image.thumbnail((650,1100))
 tile=Image.new('RGB',(680,1150),'#e6edf0');ImageDraw.Draw(tile).text((15,10),path.name,fill='black');tile.paste(image,(15,40));thumbs.append(tile)
contact=Image.new('RGB',(1360,2300),'white')
for i,tile in enumerate(thumbs):contact.paste(tile,((i%2)*680,(i//2)*1150))
contact.save(out/'contact.png')
print('PASS: complete 80-entry hierarchy, Comptroller payments/approvals and pagination, Housing 704 approvals/10,529 payments, other-org isolation, desktop/mobile light/dark, no page errors or overflow')
print(out)
