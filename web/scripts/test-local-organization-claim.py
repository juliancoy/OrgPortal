#!/usr/bin/env python3
"""Claim navigation and submissions use synthetic accounts in isolated local Docker."""
import os, re, secrets, subprocess, uuid
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from local_browser_test_support import BASE, preflight, verification_link
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
        assert ctx.request.get(verification_link(email),max_redirects=0).status == 303
        good(ctx.request.post(BASE+'/pidp/auth/session/login',form={'username':email,'password':password},headers={'Origin':BASE}))
        token = good(ctx.request.get(BASE+'/pidp/auth/session-token'))['access_token']
        auth = {'Authorization':'Bearer '+token}
        good(ctx.request.get(BASE+'/api/org/api/accounts/me',headers=auth))
        return ctx, auth
    owner, owner_auth = account('owner')
    assert good(owner.request.get(BASE+'/api/org/api/network/replication/status'))['mode'] == 'primary'
    org = good(owner.request.post(BASE+'/api/org/api/network/orgs',headers=owner_auth,data={'name':f'Dummy Claim Org {run}','city':'Baltimore','kind':'organization','acknowledgeOwnership':True}))
    profile = BASE+'/orgs/'+org['slug']; claim = profile+'/claim'
    guest = context(); page = guest.new_page(); page.goto(profile,wait_until='domcontentloaded')
    expect(page.get_by_label('Ownership challenge',exact=True)).to_have_count(0)
    page.get_by_role('link',name='Claim this Org',exact=True).click()
    expect(page).to_have_url(claim)
    expect(page.get_by_role('heading',name='Claim this Org',exact=True)).to_be_visible()
    expect(page.get_by_role('link',name='Sign in',exact=True)).to_have_attribute('href',re.compile('next=.*%2Fclaim'))
    challenger, challenger_auth = account('challenger'); page = challenger.new_page(); page.goto(profile,wait_until='domcontentloaded')
    page.get_by_role('link',name='Claim this Org',exact=True).click()
    explanation = page.get_by_label('Why should you manage this organization?',exact=True)
    expect(explanation).to_be_visible(timeout=30000)
    explanation.fill('Synthetic claim explanation for isolated local testing.')
    page.get_by_role('button',name='Claim this Org',exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('submitted for review',timeout=30000)
    state = good(guest.request.get(BASE+'/api/org/api/network/orgs/public/'+org['slug']))
    assert state['claimed_by_user_id'] == org['claimed_by_user_id'] and state['pending_challenges_count'] == 1
    for width in [1280,390]:
        page.set_viewport_size({'width':width,'height':1000})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    owner_page = owner.new_page(); owner_page.goto(claim,wait_until='domcontentloaded')
    expect(owner_page.get_by_text('You already manage this organization.',exact=False)).to_be_visible(timeout=30000)
    expect(owner_page.get_by_role('button',name='Claim this Org',exact=True)).to_have_count(0)
    # Direct fixture setup is limited to this newly created synthetic organization.
    unclaimed = good(owner.request.post(BASE+'/api/org/api/network/orgs',headers=owner_auth,data={'name':f'Dummy Unclaimed Org {run}','city':'Baltimore','kind':'organization','acknowledgeOwnership':True}))
    assert re.fullmatch(r'[0-9a-f-]{36}',unclaimed['id'])
    fixture_sql = "DELETE FROM organization_ownerships WHERE organization_id='{0}'; DELETE FROM organization_memberships WHERE organization_id='{0}';".format(unclaimed['id'])
    subprocess.run(['docker','exec',os.environ.get('CLAIM_ORG_CONTAINER','android-team-form-community-api'),'npx','wrangler','d1','execute','org','--local','--command',fixture_sql],check=True,capture_output=True,text=True)
    page.goto(BASE+'/orgs/'+unclaimed['slug']+'/claim',wait_until='domcontentloaded')
    expect(page.get_by_role('button',name='Claim this Org',exact=True)).to_be_enabled(timeout=30000)
    expect(page.get_by_label('Why should you manage this organization?',exact=True)).to_have_count(0)
    page.get_by_role('button',name='Claim this Org',exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Organization claimed.',timeout=30000)
    assert good(challenger.request.get(BASE+'/api/org/api/network/orgs/'+unclaimed['id']+'/membership',headers=challenger_auth))['role'] == 'owner'
    browser.close()
print('PASS: profile link, separate form, guest sign-in return, owned request, owner guard, unclaimed claim, desktop/mobile')
