#!/usr/bin/env python3
"""Upload and lost-work checks against synthetic accounts on isolated local Docker."""
import base64,json,secrets,re,subprocess,uuid
from pathlib import Path
from urllib.parse import urlencode,urlparse
from playwright.sync_api import sync_playwright,expect
from local_browser_test_support import BASE,preflight,PIDP_CONTAINER
preflight()
assert PIDP_CONTAINER.startswith(('common-form-test-','android-team-form-','team-form-test-'))
run=uuid.uuid4().hex[:10]
out=Path('/tmp/orgportal-upload-resilience');out.mkdir(exist_ok=True)
seed='''
import asyncio,sys,json,hashlib
sys.path.insert(0,"/app")
from datetime import datetime,timedelta
from urllib.parse import urlparse
from sqlalchemy import select
from db import SessionLocal,engine
from config import settings
from models import User
args=json.load(sys.stdin)
assert urlparse(settings.database_url).hostname in ['common-form-test-identity-db','android-team-form-identity-db','team-form-test-identity-db']
async def main():
 async with SessionLocal() as session:
  user=(await session.execute(select(User).where(User.email==args['email']))).scalar_one()
  identity=dict(user.identity_data or {})
  identity['email_verification']={'token_hash':hashlib.sha256(args['token'].encode()).hexdigest(),'expires_at':(datetime.utcnow()+timedelta(minutes=10)).isoformat(),'next':'/profile'}
  user.identity_data=identity
  await session.commit()
 await engine.dispose()
asyncio.run(main())
'''
def ok(r):
 assert r.ok,f'Local fixture request failed: {r.status}'
 return r.json() if 'application/json' in r.headers.get('content-type','') else {}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 contexts=[]
 def account(role):
  c=browser.new_context(ignore_https_errors=True);contexts.append(c)
  c.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in ['localhost','127.0.0.1'] else route.abort())
  email=f'team-form-{role}-{run}@example.com';password=secrets.token_urlsafe(32)
  ok(c.request.post(BASE+'/pidp/auth/register',data={'email':email,'password':password,'full_name':'Dummy '+role+' '+run}))
  token=secrets.token_urlsafe(32)
  result=subprocess.run(['docker','exec','-i','-w','/tmp',PIDP_CONTAINER,'/venv/bin/python','-c',seed],input=json.dumps({'email':email,'token':token}),capture_output=True,text=True)
  assert result.returncode==0,'Could not prepare local synthetic verification challenge'
  assert c.request.get(BASE+'/pidp/auth/verify-email?'+urlencode({'email':email,'token':token}),max_redirects=0).status==303
  ok(c.request.post(BASE+'/pidp/auth/session/login',form={'username':email,'password':password},headers={'Origin':BASE}))
  token=ok(c.request.get(BASE+'/pidp/auth/session-token'))['access_token']
  return c,{'Authorization':'Bearer '+token}
 host,auth=account('host')
 assert ok(host.request.get(BASE+'/api/org/api/network/replication/status'))['mode']=='primary'
 group=ok(host.request.post(BASE+'/api/org/api/network/orgs',headers=auth,data={'name':'Dummy upload host '+run,'city':'Baltimore','kind':'organization','acknowledgeOwnership':True}))
 event=ok(host.request.post(BASE+'/api/org/api/network/events',headers=auth,data={'title':'Dummy upload demo '+run,'host_type':'org','host_org_id':group['id'],'ingest_key':'upload-'+run,'starts_at':'2099-11-17T23:00:00Z','description':'A synthetic upload test.'}))
 endpoint=BASE+'/api/org/api/network/events/'+event['id']+'/presentations'
 ok(host.request.put(endpoint+'/form',headers=auth,data={'enabled':True}))
 applicant,appauth=account('applicant');page=applicant.new_page()
 page.goto(BASE+'/events/'+event['slug']+'/apply')
 form=page.get_by_role('form',name='Team presentation application')
 expect(form).to_be_visible(timeout=30000)
 form.get_by_label('Team name',exact=True).fill('Dummy upload team '+run)
 form.get_by_label('Presentation title',exact=True).fill('A preserved proposal')
 form.get_by_label('Abstract',exact=True).fill('Details must survive refresh and failed uploads.')
 # Reload immediately after an edit, without waiting for a draft timer.
 page.reload();expect(form.get_by_label('Presentation title',exact=True)).to_have_value('A preserved proposal')
 page.evaluate('window.createImageBitmap=undefined')
 png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
 form.get_by_label('Team image (optional)',exact=True).set_input_files({'name':'logo.png','mimeType':'image/png','buffer':png})
 image=form.get_by_role('img',name='Team image preview');expect(image).to_be_visible();prior=image.get_attribute('src')
 form.get_by_label('Team image (optional)',exact=True).set_input_files({'name':'bad.txt','mimeType':'text/plain','buffer':b'invalid replacement'})
 expect(image).to_have_attribute('src',prior)
 form.get_by_label('Add submission attachments',exact=True).set_input_files([{'name':'demo.png','mimeType':'image/png','buffer':png},{'name':'notes.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.4\nSynthetic attachment'}])
 page.get_by_role('link',name='Back to event',exact=True).first.click()
 expect(page.get_by_role('alertdialog')).to_be_visible()
 assert page.get_by_role('alertdialog').evaluate('(d)=>d.matches(":modal")')
 page.get_by_role('button',name='Keep working',exact=True).click()
 expect(form.get_by_label('Presentation title',exact=True)).to_have_value('A preserved proposal')
 # Force the second attachment to fail after the application and first file save.
 failed=[False]
 def upload(route):
  if route.request.method=='POST' and 'notes.pdf' in (route.request.post_data_buffer or b'').decode('latin1') and not failed[0]:
   failed[0]=True;route.fulfill(status=503,json={'message':'Synthetic upload outage'});return
  route.continue_()
 page.route('**/presentations/*/attachments',upload)
 form.get_by_role('button',name='Submit application',exact=True).click()
 expect(page.get_by_role('alert').filter(has_text='Your application is saved, but an attachment could not upload')).to_be_visible(timeout=30000)
 expect(form.get_by_role('button',name='Remove selected file notes.pdf')).to_be_visible()
 expect(form.get_by_role('button',name='Remove selected file demo.png')).to_have_count(0)
 expect(form.get_by_role('link').filter(has_text='demo.png')).to_be_visible()
 page.once('dialog',lambda dialog:dialog.dismiss())
 form.get_by_role('button',name='Delete attachment demo.png').click()
 expect(form.get_by_role('link').filter(has_text='demo.png')).to_be_visible()
 saved=ok(host.request.get(endpoint,headers=auth))['submissions'];assert len(saved)==1
 submission=saved[0]['submission_id'];team=saved[0]['organization_id']
 page.screenshot(path=str(out/'failed-upload-retained.png'),full_page=True)
 form.get_by_role('button',name='Save changes',exact=True).click()
 expect(page.get_by_role('heading',name='Submission complete',exact=True)).to_be_visible(timeout=30000)
 assert len(ok(host.request.get(endpoint,headers=auth))['submissions'])==1,'Retry must not duplicate the application'
 attachments=ok(applicant.request.get(endpoint+'/'+submission+'/attachments'))['attachments'];assert len(attachments)==2
 profile=ok(applicant.request.get(BASE+'/api/org/api/network/orgs/'+team,headers=appauth))
 assert profile['image_url'] and applicant.request.get(profile['image_url']).ok
 page.get_by_role('link',name='View application',exact=True).click();expect(form.get_by_label('Presentation title',exact=True)).to_have_value('A preserved proposal')
 page.screenshot(path=str(out/'saved-application.png'),full_page=True)
 print('PASS: immediate reload; decoder unavailable; invalid replacement retained; leave/keep editing; partial upload outage; retry without duplicate; saved image and attachments; reopen application',flush=True)
 # Guests also get an explicit warning rather than silently losing private text.
 guest=browser.new_context(ignore_https_errors=True);contexts.append(guest)
 guest.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in ['localhost','127.0.0.1'] else route.abort())
 gp=guest.new_page();gp.goto(BASE+'/events/'+event['slug']+'/apply/guest')
 guestform=gp.get_by_role('form',name='Guest presentation application')
 expect(guestform).to_be_visible(timeout=30000);guestform.get_by_label('Your name',exact=True).fill('Dummy guest')
 gp.get_by_role('link',name='Back to event',exact=True).first.click()
 expect(gp.get_by_role('alertdialog')).to_contain_text('Your unsent application details are not saved')
 gp.get_by_role('button',name='Keep working',exact=True).click();expect(guestform.get_by_label('Your name',exact=True)).to_have_value('Dummy guest')
 print('PASS: private guest application warns before losing unsent details',flush=True)
 for c in contexts:c.close()
 browser.close()
