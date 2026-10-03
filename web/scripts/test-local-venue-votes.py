#!/usr/bin/env python3
"""Exercise real onboarding on the local Docker stack (no API fixtures).

Start with ORGPORTAL_LOCAL_TENANT_HOST=lifetech.fyi python run.py <prefix> <network>.
PIdP must use local log delivery so verification never sends external email.
"""
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time
import uuid
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('PLAYWRIGHT_BASE_URL', 'https://localhost:8443').rstrip('/')
PIDP_CONTAINER = os.environ.get('ONBOARDING_PIDP_CONTAINER', 'bmoremedtech-pidp-dev')
ROOT = Path(__file__).resolve().parents[2] / '.local' / 'session-test'
assert urlparse(BASE).hostname in {'localhost', '127.0.0.1'}, 'Use a local Docker gateway'
ROOT.mkdir(parents=True, exist_ok=True)
ROOT.chmod(0o700)


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True, stderr=subprocess.PIPE)


def preflight():
    config = json.loads(docker('inspect', PIDP_CONTAINER))[0]
    env = dict(item.split('=', 1) for item in config['Config']['Env'] if '=' in item)
    assert config['State']['Running'], 'Local PIdP container is not running'
    assert BASE in env.get('ALLOWED_ORIGINS', '').split(','), (
        'PIdP does not trust the test gateway origin. Start the shared stack with OrgPortal/run.py.'
    )
    assert env.get('EMAIL_VERIFICATION_DELIVERY', 'log') == 'log', 'Use local verification log delivery'


def verification_link(email):
    # Treat the local delivery log as a test mailbox; never print its secret URLs.
    for _ in range(30):
        logs = subprocess.run(
            ['docker', 'logs', '--since', '5m', PIDP_CONTAINER],
            capture_output=True, text=True, check=True,
        )
        for candidate in re.findall(r'https?://[^\s]+', logs.stdout + logs.stderr):
            parsed = urlparse(candidate)
            if parsed.path.endswith('/auth/verify-email') and parse_qs(parsed.query).get('email') == [email]:
                assert parsed.hostname in {'localhost', '127.0.0.1'}, 'Verification must stay local'
                # PIdP runs behind the gateway's /pidp mount.
                return BASE + '/pidp/auth/verify-email?' + parsed.query
        time.sleep(.2)
    raise AssertionError('No verification message in the local PIdP delivery log')


preflight()
EVENT = 'local-venue-vote-test'
API = BASE + '/api/org/api/network/events/' + EVENT + '/venue-votes'
with sync_playwright() as p:
 browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
 try:
  context = browser.new_context(ignore_https_errors=True, viewport={'width':1280,'height':900}, timezone_id='America/New_York')
  context.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in {'localhost','127.0.0.1'} else route.abort())
  for path in ['/pidp/health','/api/org/health']:
   assert context.request.get(BASE+path).ok, 'Local endpoints must be healthy'
  page = context.new_page()
  page.goto(BASE+'/events/'+EVENT)
  expect(page.get_by_role('heading',name='Event venues',exact=True)).to_be_visible(timeout=30000)
  expect(page.get_by_role('button',name='Upvote Checkerspot Brewing',exact=True)).to_be_disabled()
  assert page.get_by_role('heading',name='Rank the candidate venues').count()==0
  def login(ctx):
   account={'email':'venue-vote-'+uuid.uuid4().hex+'@example.com','password':secrets.token_urlsafe(32)}
   response=ctx.request.post(BASE+'/pidp/auth/register',data={**account,'full_name':'Local Venue Voter'},max_redirects=0)
   assert response.ok, 'Local registration failed'
   assert ctx.request.get(verification_link(account['email']),max_redirects=0).status==303
   assert ctx.request.post(BASE+'/pidp/auth/session/login',form={'username':account['email'],'password':account['password']},headers={'Origin':BASE},max_redirects=0).ok
   token=ctx.request.get(BASE+'/pidp/auth/session-token').json()['access_token']
   return {'Authorization':'Bearer '+token}
  headers=login(context)
  page.reload()
  up=page.get_by_role('button',name='Upvote Checkerspot Brewing',exact=True)
  down=page.get_by_role('button',name='Downvote Checkerspot Brewing',exact=True)
  expect(up).to_be_enabled(timeout=30000)
  up.click(); expect(up).to_have_attribute('aria-pressed','true'); expect(page.get_by_role('status')).to_contain_text('upvote')
  row=page.locator('.venue-vote-row').filter(has=up)
  expect(row).to_contain_text('1 upvotes · 0 downvotes · 1 total votes')
  page.reload();up=page.get_by_role('button',name='Upvote Checkerspot Brewing',exact=True);down=page.get_by_role('button',name='Downvote Checkerspot Brewing',exact=True)
  expect(up).to_have_attribute('aria-pressed','true',timeout=30000)
  down.click();expect(down).to_have_attribute('aria-pressed','true');expect(up).to_have_attribute('aria-pressed','false')
  down.click();expect(down).to_have_attribute('aria-pressed','false')
  expect(page.get_by_role('status')).to_contain_text('cleared')
  other=browser.new_context(ignore_https_errors=True)
  other_headers=login(other)
  assert other.request.put(API+'/local-vote-a',headers=other_headers,data={'value':-1}).ok
  assert context.request.get(API,headers=headers).json()['votes']['local-vote-a']==0
  assert other.request.get(API,headers=other_headers).json()['votes']['local-vote-a']==-1
  page.reload();expect(page.locator('.venue-vote-row').filter(has=page.get_by_role('button',name='Upvote Checkerspot Brewing',exact=True))).to_contain_text('0 upvotes · 1 downvotes · 1 total votes',timeout=30000)
  for width in [1280,390,320]:
   page.set_viewport_size({'width':width,'height':900})
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Page overflows'
   for button in page.locator('.venue-vote-controls button').all():
    box=button.bounding_box();assert box['width']>=44 and box['height']>=44
   assert page.locator('.venue-vote-avatar').count()==2
   page.screenshot(path=str(ROOT/f'venue-votes-{width}.png'),full_page=True)
  assert 'user_id' not in str(context.request.get(API+'/public').json())
  assert other.request.put(API+'/local-vote-a',headers=other_headers,data={'value':0}).ok
  print('PASS: real local login; private per-user votes; upvote/downvote/clear; reload persistence; public totals; desktop/390/320px layouts')
  other.close();context.close()
 finally:browser.close()
