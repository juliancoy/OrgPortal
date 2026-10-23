#!/usr/bin/env python3
"""Claim navigation and submissions use synthetic accounts in isolated local Docker."""
import os, re, secrets, subprocess, uuid
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from local_browser_test_support import BASE, PIDP_CONTAINER, preflight
preflight()
run = uuid.uuid4().hex[:10]
def good(response):
    assert response.ok, f'{response.status}: {response.text()[:300]}'
    return response.json() if 'application/json' in response.headers.get('content-type','') else {}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
    def context():
        ctx = browser.new_context(ignore_https_errors=True, viewport={'width':1280,'height':1000})
        ctx.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in {'localhost','127.0.0.1'} else route.abort())
        return ctx
    def account(label):
        ctx = context(); email = f'claim-{label}-{run}@example.com'; password = secrets.token_urlsafe(32)
        good(ctx.request.post(BASE+'/pidp/auth/register',data={'email':email,'password':password,'full_name':f'Dummy Claim {label} {run}'}))
        # Mail delivery stays disabled; verify only this run's synthetic local account.
        assert email.startswith('claim-') and email.endswith('-'+run+'@example.com')
        seed = """
import asyncio,sys
from datetime import datetime
from sqlalchemy import select
from db import SessionLocal,engine
from models import User
async def verify():
    async with SessionLocal() as session:
        user=(await session.execute(select(User).where(User.email==sys.argv[1]))).scalar_one()
        identity=dict(user.identity_data or {})
        identity.update(email_verified=True,email_verified_at=datetime.utcnow().isoformat())
        identity.pop('email_verification',None)
        user.identity_data=identity
        await session.commit()
    await engine.dispose()
asyncio.run(verify())
"""
        subprocess.run(['docker','exec','-e','PYTHONPATH=/app','-w','/tmp',PIDP_CONTAINER,'/venv/bin/python','-c',seed,email],check=True,capture_output=True,text=True)
        good(ctx.request.post(BASE+'/pidp/auth/session/login',form={'username':email,'password':password},headers={'Origin':BASE}))
        token = good(ctx.request.get(BASE+'/pidp/auth/session-token'))['access_token']
        auth = {'Authorization':'Bearer '+token}
        good(ctx.request.get(BASE+'/api/org/api/accounts/me',headers=auth))
        return ctx, auth
    owner, owner_auth = account('owner')
    assert good(owner.request.get(BASE+'/api/org/api/network/replication/status'))['mode'] == 'primary'
    org = good(owner.request.post(BASE+'/api/org/api/network/orgs',headers=owner_auth,data={'name':f'Dummy Claim Org {run}','city':'Baltimore','kind':'organization','acknowledgeOwnership':True}))
    profile = BASE+'/orgs/'+org['slug']
    guest = context(); page = guest.new_page(); page.goto(profile,wait_until='domcontentloaded')
    expect(page.get_by_label('Ownership challenge',exact=True)).to_have_count(0)
    expect(page.get_by_role('link',name='Claim this Org',exact=True)).to_have_attribute('href',re.compile('.*'))
    retired = guest.new_page(); retired.goto(profile+'/claim',wait_until='domcontentloaded')
    expect(retired.get_by_role('heading',name=re.compile('not found',re.I))).to_be_visible(timeout=30000)
    retired.close()
    challenger, challenger_auth = account('challenger'); page = challenger.new_page(); page.goto(profile,wait_until='domcontentloaded')
    page.get_by_role('button',name='Claim this Org',exact=True).click()
    expect(page.get_by_role('status').filter(has_text='Claim recorded.')).to_be_visible(timeout=30000)
    expect(page).to_have_url(profile)
    state = good(guest.request.get(BASE+'/api/org/api/network/orgs/public/'+org['slug']))
    assert state['claimed_by_user_id'] == org['claimed_by_user_id'] and state['pending_challenges_count'] == 1
    # Retried claims reuse the same pending entry instead of rejecting or duplicating it.
    first = good(challenger.request.post(BASE+'/api/org/api/network/orgs/'+org['id']+'/claim',headers=challenger_auth))
    second = good(challenger.request.post(BASE+'/api/org/api/network/orgs/'+org['id']+'/claim',headers=challenger_auth))
    assert first['status'] == 'pending' and first['claimId'] == second['claimId']
    for width in [1280,390]:
        page.set_viewport_size({'width':width,'height':1000})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    browser.close()
print('PASS: inline claim, no explanation or claim page, accepted competing claim, idempotent retries, desktop/mobile')
