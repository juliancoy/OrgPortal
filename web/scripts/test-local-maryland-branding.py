"""Read-only local Maryland brand review; external requests and writes are blocked."""
import json, os, pathlib
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from PIL import Image, ImageDraw
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1','::1']
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/maryland-branding'
out.mkdir(parents=True,exist_ok=True)
shots=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 for theme in ['light','dark']:
  for width in [1440,390]:
   ctx=browser.new_context(ignore_https_errors=True,viewport={'width':width,'height':1100},color_scheme=theme)
   ctx.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in ['localhost','127.0.0.1','::1'] and route.request.method in ['GET','HEAD','OPTIONS'] else route.abort())
   ctx.add_init_script('localStorage.setItem("orgportal.theme",'+json.dumps(theme)+')')
   page=ctx.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(base+'/orgs/state-of-maryland',wait_until='domcontentloaded')
   flag=page.get_by_role('img',name='Maryland state flag',exact=True)
   expect(flag).to_be_visible(timeout=60000)
   expect(page.locator('.organization-profile-avatar img')).to_have_attribute('src','/images/organization-themes/maryland-logo.svg')
   for image in [flag,page.locator('.organization-profile-avatar img')]:
    expect(image).to_be_visible()
    assert image.evaluate('(img)=>img.complete && img.naturalWidth>0')
   primary=page.locator('.organization-profile').evaluate('(node)=>getComputedStyle(node).getPropertyValue("--primary").trim()')
   assert primary==('#C8122C' if theme=='light' else '#FFC838'),primary
   expect(page.get_by_role('region',name='EcoMap for State of Maryland').locator('canvas')).to_be_visible(timeout=30000)
   expect(page.get_by_role('heading',name='Departments and agencies',exact=True)).to_be_attached(timeout=30000)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.evaluate('scrollTo(0,0)')
   shot=out/f'page-{width}-{theme}.png';page.screenshot(path=str(shot));shots.append(shot)
   page.get_by_role('tab',name='Branding',exact=True).click()
   expect(page.get_by_role('heading',name='Approved imagery',exact=True)).to_be_visible(timeout=30000)
   for name,value in [('Maryland Red','#C8122C'),('Maryland Gold','#FFC838'),('Black','#231F20'),('White','#FFFFFF')]:
    expect(page.get_by_role('button',name=f'Copy {name} color {value}',exact=True)).to_be_visible()
   expect(page.get_by_role('complementary',name='Public identity references')).to_be_visible()
   for image in page.locator('.tenant-brand-assets img').all():
    image.scroll_into_view_if_needed()
    expect(image).to_be_visible()
    page.wait_for_function('(src)=>Array.from(document.images).some(img=>img.src===src && img.complete && img.naturalWidth>0)',arg=image.get_attribute('src') if image.get_attribute('src').startswith('http') else base+image.get_attribute('src'))
   if width==1440 and theme=='light':
    with page.expect_download() as download:
     page.get_by_role('button',name='Download style guide (PNG)',exact=True).click()
    assert pathlib.Path(download.value.path()).read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
   assets=page.locator('.tenant-brand-assets');assets.screenshot(path=str(out/f'assets-{width}-{theme}.png'))
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.goto(base+'/orgs/tedco',wait_until='domcontentloaded')
   expect(page.get_by_role('heading',name='About TEDCO',exact=True)).to_be_visible(timeout=30000)
   expect(page.locator('.organization-profile[data-source-brand]')).to_have_count(0)
   expect(page.get_by_role('img',name='Maryland state flag',exact=True)).to_have_count(0)
   assert page.locator('.organization-profile').evaluate('(node)=>getComputedStyle(node).getPropertyValue("--primary").trim()') not in ['#C8122C','#FFC838']
   assert not errors,errors
   print(f'PASS {width}/{theme}: sourced logo/flag, colors, EcoMap, evidence, brand guide, assets, isolation, no overflow/errors',flush=True)
   ctx.close()
 browser.close()
contact=Image.new('RGB',(1460,2260),'#e6edf0')
for index,path in enumerate(shots):
 picture=Image.open(path).convert('RGB');picture.thumbnail((700,1070))
 x,y=(index%2)*730+15,(index//2)*1130+35
 ImageDraw.Draw(contact).text((x,y-22),path.name,fill='black');contact.paste(picture,(x,y))
contact.save(out/'contact.png')
print(out)
