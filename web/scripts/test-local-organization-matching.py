"""Shared grouping UI + real authorized writes in isolated Docker, then read-only BGE.
Synthetic evidence is seeded only in the named non-replicating fixture database.
The synthetic query responses exercise the editor; server projection has SQL-free
unit coverage. BGE uses the actual public query API and never receives writes.
"""
import hashlib,json,pathlib,secrets,subprocess,uuid
from urllib.parse import urlparse,parse_qs,quote
from playwright.sync_api import sync_playwright,expect
from local_browser_test_support import BASE,PIDP_CONTAINER
assert BASE=='https://localhost:19458' and PIDP_CONTAINER=='common-form-test-identity-api'
config=json.loads(subprocess.check_output(['docker','inspect',PIDP_CONTAINER]))[0]
env=dict(v.split('=',1) for v in config['Config']['Env'] if '=' in v)
identity_origin=env['PUBLIC_BASE_URL'];assert urlparse(identity_origin).hostname in ['localhost','id.localhost']
assert identity_origin in env['ALLOWED_ORIGINS'].split(',') and env['EMAIL_VERIFICATION_DELIVERY']=='log'
out=pathlib.Path(__file__).resolve().parents[2]/'artifacts/layout-review/organization-matching';out.mkdir(parents=True,exist_ok=True)
run=uuid.uuid4().hex[:10];source_name='The Dummy Matching University '+run
source_id='source-label:organization_support:recipient:'+hashlib.sha256(source_name.encode()).hexdigest()[:32]
def good(response):
 assert response.ok,f'{response.status}: {response.text()[:250]}'
 return response.json() if 'application/json' in response.headers.get('content-type','') else {}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(ignore_https_errors=True,viewport={'width':1200,'height':1000})
 ctx.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname in ['localhost','127.0.0.1','::1'] else r.abort())
 assert good(ctx.request.get(BASE+'/api/org/api/network/replication/status'))['mode']=='primary'
 email='grouping-'+run+'@example.com';password=secrets.token_urlsafe(32)
 good(ctx.request.post(identity_origin+'/auth/register',data={'email':email,'password':password,'full_name':'Dummy Grouping Editor '+run}))
 # This isolated identity stack disables mail. Verify only the freshly created
 # synthetic account in its dedicated test DB; never alter a real account.
 verify_code="""
import asyncio,sys
from sqlalchemy import select
from db import SessionLocal,engine
from models import User
async def run():
 async with SessionLocal() as session:
  user=(await session.execute(select(User).where(User.email==sys.argv[1]))).scalar_one()
  assert user.full_name.startswith('Dummy Grouping Editor ')
  user.identity_data={**user.identity_data,'email_verified':True}
  await session.commit()
 await engine.dispose()
asyncio.run(run())
"""
 subprocess.run(['docker','exec','-w','/tmp','-e','PYTHONPATH=/app','common-form-test-identity-api','/venv/bin/python','-c',verify_code,email],text=True,capture_output=True,check=True)
 good(ctx.request.post(identity_origin+'/auth/session/login',form={'username':email,'password':password},headers={'Origin':identity_origin}))
 token=good(ctx.request.get(identity_origin+'/auth/session-token'))['access_token'];auth={'Authorization':'Bearer '+token}
 # Bootstrap the genuine fixture session through the local legacy /pidp mount.
 # The stack now hosts PIdP separately; authentication UI is outside this check.
 def identity_proxy(route):
  parsed=urlparse(route.request.url)
  response=ctx.request.get(identity_origin+parsed.path.removeprefix('/pidp')+('?' + parsed.query if parsed.query else ''),headers={'Authorization':'Bearer '+token,'Origin':identity_origin})
  route.fulfill(response=response)
 ctx.route('**/pidp/**',identity_proxy)
 good(ctx.request.get(BASE+'/api/org/api/accounts/me',headers=auth))
 org=good(ctx.request.post(BASE+'/api/org/api/network/orgs',headers=auth,data={'name':'Dummy Matching University '+run,'city':'Baltimore','kind':'organization','acknowledgeOwnership':True}))
 seed="""
 import {DatabaseSync} from 'node:sqlite';import {readdirSync,readFileSync} from 'node:fs';
 const input=JSON.parse(readFileSync(0,'utf8'));if(!input.label.startsWith('The Dummy Matching University '))throw Error('Synthetic source required');
 let seeded=false;for(const file of readdirSync('.wrangler/state/v3/d1',{recursive:true}).filter(f=>f.endsWith('.sqlite')&&!f.endsWith('metadata.sqlite'))){
  const db=new DatabaseSync('.wrangler/state/v3/d1/'+file);try{
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='organizations'").get())continue;
   if(!db.prepare('SELECT 1 FROM organizations WHERE id=? AND name LIKE ?').get(input.org,'Dummy Matching University %'))continue;
   if(db.prepare('SELECT 1 FROM organization_replica_state WHERE source IS NOT NULL').get())throw Error('Cannot seed a replica');
   db.prepare(`INSERT INTO organization_support_records(id,from_label,to_label,support_kind,description,source_url,created_at)
    VALUES(?,?,?,'transfer','Synthetic grouping test record','https://example.test/evidence',?)`).run('grouping-fixture:'+input.run,'Dummy payer',input.label,new Date().toISOString());seeded=true;
  }finally{db.close()}
 }if(!seeded)throw Error('Isolated fixture database not found');
 """
 subprocess.run(['docker','exec','-i','common-form-test-community-api','node','--input-type=module','-e',seed],input=json.dumps({'org':org['id'],'label':source_name,'run':run}),text=True,check=True,capture_output=True)
 endpoint=BASE+'/api/org/api/network/orgs/'+quote(org['id'],safe='')+'/evidence-group'
 assert good(ctx.request.get(endpoint+'/access',headers=auth))['canManage']
 def fixture(route):
  url=urlparse(route.request.url);q=parse_qs(url.query);section=url.path.split('/')[-1];included=source_id in json.loads(q.get('members',['[]'])[0])
  center={'id':org['id'],'name':org['name'],'slug':org['slug'],'recordCount':0,'category':'general'}
  source={'id':source_id,'name':source_name,'slug':None,'recordCount':1,'category':'general'}
  meta={'version':'group-fixture','generatedAt':'2026-11-21T00:00:00Z'}
  if section=='organization-group':body={**meta,'organization':center,'members':[center]+([source] if included else []),'missingMembers':[]}
  elif section=='organizations':body={**meta,'records':[source] if q.get('q',[''])[0].lower() in source_name.lower() else [],'total':1,'nextOffset':None,'offset':0}
  elif section=='organization-map':body={**meta,'anchor':org['id'],'organizations':[center]+([{'id':'dummy-payer','name':'Dummy payer','slug':None,'category':'general'}] if included else []),'relationships':[{'id':'fixture-pair','source':'dummy-payer','target':org['id'],'kinds':['transfer'],'recordCount':1}] if included else [],'total':int(included),'incoming':int(included),'outgoing':0,'offset':0,'nextOffset':None}
  elif section=='organization-evidence':body={**meta,'organization':{**center,'recordCount':int(included)},'parents':[],'children':[],'groups':[{'kind':'transfer','count':1}] if included else [],'records':[{'id':'fixture','source':'dummy-payer','target':source_id,'sourceLabel':'Dummy payer','targetLabel':source_name,'kind':'transfer','amount':None}] if included else [],'total':int(included),'offset':0,'nextOffset':None}
  else:return route.continue_()
  route.fulfill(json=body)
 ctx.route('**/api/ecosystem/**',fixture)
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE+'/orgs/'+org['slug'],wait_until='domcontentloaded')
 panel=page.locator('.organization-grouping');panel.locator('summary').first.click()
 expect(panel.get_by_label('Find a source node')).to_be_visible(timeout=30000)
 expect(page.locator('.organization-ecomap canvas')).to_have_attribute('data-ready','true',timeout=30000)
 page.evaluate('window.originalMap=document.querySelector(".organization-ecomap canvas")')
 panel.get_by_role('button',name='Associate eligible matches on this page',exact=True).click()
 expect(panel.get_by_role('status')).to_have_text('1 associations recorded.')
 panel.get_by_text('Association history',exact=True).click()
 expect(panel).to_contain_text('organization-name-v1')
 expect(panel).to_contain_text('score 100/100')
 assert good(ctx.request.get(endpoint+'/history'))['records'][0]['method']=='automatic'
 expect(panel.locator('summary').first).to_have_text('Grouping · 2 source nodes')
 expect(page.locator('.organization-ecomap').get_by_role('status').first).to_contain_text('1 upstream')
 assert page.evaluate('originalMap===document.querySelector(".organization-ecomap canvas")')
 page.get_by_role('button',name='View '+org['name']+' evidence (1)',exact=True).click()
 expect(page.locator('.organization-evidence-records')).to_contain_text('Dummy payer → '+source_name)
 page.reload(wait_until='domcontentloaded');panel.locator('summary').first.click()
 expect(panel.get_by_role('button',name='Remove '+source_name+' from grouping',exact=True)).to_be_visible(timeout=30000)
 for width in [1200,390]:
  page.set_viewport_size({'width':width,'height':1000});panel.screenshot(path=str(out/f'editor-{width}.png'))
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 panel.get_by_text('Association history',exact=True).click()
 expect(panel).to_contain_text('organization-name-v1')
 # Failed saves leave the existing membership and provide an explicit retry.
 page.route('**/evidence-group',lambda r:r.fulfill(status=503,json={'error':'Temporary fixture save failure'}),times=1)
 panel.get_by_role('button',name='Remove '+source_name+' from grouping',exact=True).click()
 expect(panel.get_by_role('alert')).to_contain_text('Temporary fixture save failure')
 assert source_id in good(ctx.request.get(BASE+'/api/org/api/network/evidence-groups/public?org='+org['slug']))['group']['members']
 panel.get_by_role('button',name='Retry',exact=True).click();expect(panel.locator('summary').first).to_have_text('Grouping · 1 source node')
 expect(page.locator('.organization-ecomap').get_by_role('status').first).to_contain_text('No documented')
 assert not good(ctx.request.get(BASE+'/api/org/api/network/evidence-groups/public?org='+org['slug']))['group']['members']
 panel.get_by_role('button',name='Associate eligible matches on this page',exact=True).click()
 expect(panel.get_by_role('status')).to_contain_text('human removed')
 assert not good(ctx.request.get(BASE+'/api/org/api/network/evidence-groups/public?org='+org['slug']))['group']['members']
 assert len(good(ctx.request.get(endpoint+'/history'))['records'])==2
 guest=browser.new_context(ignore_https_errors=True)
 assert guest.request.put(endpoint,data={'action':'add','member':{'id':source_id,'name':source_name}}).status in [401,403]
 guest.close();assert not errors,errors;ctx.close()
 browser.close()
print('PASS: isolated authorized automatic association, recorded score/version/source identity, reload, human removal, durable exclusion, guest denial, failed save/retry, retained canvas, desktop/mobile.')
