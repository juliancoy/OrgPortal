#!/usr/bin/env python3
"""QCash visual review using real local components and synthetic read-only data."""
import json,os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from PIL import Image,ImageOps,ImageDraw
root=Path(__file__).resolve().parents[2]
out=root/'artifacts/layout-review/qcash';out.mkdir(parents=True,exist_ok=True)
base=os.environ.get('PLAYWRIGHT_BASE_URL','https://localhost:8443').rstrip('/')
assert urlparse(base).hostname in {'localhost','127.0.0.1'}
chain='34'*32
report=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 for theme in ['light','dark']:
  for device,width in [('desktop',1440),('mobile',390)]:
   shots=[]
   for mode in ['receive','send']:
    context=browser.new_context(ignore_https_errors=True,accept_downloads=True,viewport={'width':width,'height':1000},color_scheme=theme)
    context.add_init_script("localStorage.setItem('orgportal.theme',"+json.dumps(theme)+")")
    context.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in {'localhost','127.0.0.1'} else route.abort())
    def fixture(route):
     path=urlparse(route.request.url).path
     if route.request.method!='GET':raise AssertionError('Visual fixture attempted a write')
     if path.endswith('/network'):data={'currency':'QCash','name':'QCash Beta','chainId':chain,'height':42,'tip':'56'*32,'decimals':0,'experimental':True}
     elif '/accounts/' in path:
      address=path.rsplit('/',1)[1]
      data={'address':address,'spendable':'250','immature':'50','nonce':'1','transactions':[{'id':'ab'*32,'status':'confirmed','confirmations':3,'sender':'cd'*32,'recipient':address,'amount':'25','fee':'0'}]}
     else:route.fulfill(status=404,json={'error':'Fixture route not available'});return
     route.fulfill(json=data)
    context.route('**/api/org/api/qcash/**',fixture)
    page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(base+'/'+mode+'?currency=QCash',wait_until='domcontentloaded')
    expect(page.get_by_role('heading',name=('Receive' if mode=='receive' else 'Send')+' QCash Beta',exact=True)).to_be_visible()
    def shot(state):
     page.evaluate('document.fonts.ready')
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{mode}/{theme}/{device}/{state}: overflow'
     assert not errors,errors
     filename=f'{mode}-{state}-{device}-{theme}.png'
     page.locator('.qcash-page').screenshot(path=str(out/filename))
     shots.append((mode+' · '+state,filename));report.append({'mode':mode,'state':state,'device':device,'theme':theme,'overflow':False,'errors':errors.copy(),'file':filename})
    shot('create')
    page.get_by_role('button',name='Unlock a wallet',exact=True).click();shot('unlock')
    page.get_by_role('button',name='Create a wallet',exact=True).click()
    page.get_by_label('Backup password',exact=True).fill('synthetic-layout-only-password')
    with page.expect_download():page.get_by_role('button',name='Create wallet and download backup',exact=True).click()
    expect(page.get_by_test_id('pqt-spendable')).to_have_text('250 QCash',timeout=15000)
    shot('ready')
    context.close()
   # Contact sheets contain only public synthetic wallet addresses and UI.
   thumbwidth=500 if device=='desktop' else 300;cards=[]
   for name,file in shots:
    im=Image.open(out/file).convert('RGB');im.thumbnail((thumbwidth,1800))
    card=Image.new('RGB',(thumbwidth,im.height+38),'#e5ebef');ImageDraw.Draw(card).text((12,10),name+' / '+theme,fill='#20313e');card.paste(im,(0,38));cards.append(card)
   cols=3;rowheights=[max(c.height for c in cards[i:i+cols]) for i in range(0,len(cards),cols)]
   sheet=Image.new('RGB',(cols*(thumbwidth+16)+16,sum(rowheights)+16*(len(rowheights)+1)),'#d6dfe5');y=16
   for r,height in enumerate(rowheights):
    for c,card in enumerate(cards[r*cols:r*cols+cols]):sheet.paste(card,(16+c*(thumbwidth+16),y))
    y+=height+16
   sheet.save(out/f'contact-{device}-{theme}.png')
 browser.close()
(out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print(f'Reviewed {len(report)} QCash views: create, unlock, send and receive; desktop/mobile; light/dark.')
