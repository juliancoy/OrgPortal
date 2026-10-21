#!/usr/bin/env python3
"""Dummy-only invitation clickthrough; no mail leaves the local deployment."""
import os
import secrets
import uuid
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from local_browser_test_support import BASE, preflight, verification_link
preflight()
run_id=uuid.uuid4().hex[:10]
def ok(response):
    assert response.ok, f'Local request failed: {response.status} {response.text()[:400]}'
    return response.json() if 'application/json' in response.headers.get('content-type','') else {}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
    def context():
        ctx=browser.new_context(ignore_https_errors=True)
        ctx.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in {'localhost','127.0.0.1'} else route.abort())
        return ctx
    def identity(ctx,email,name):
        password=secrets.token_urlsafe(32)
        ok(ctx.request.post(BASE+'/pidp/auth/register',data={'email':email,'password':password,'full_name':name}))
        assert ctx.request.get(verification_link(email),max_redirects=0).status==303
        ok(ctx.request.post(BASE+'/pidp/auth/session/login',form={'username':email,'password':password},headers={'Origin':BASE}))
        return {'Authorization':'Bearer '+ok(ctx.request.get(BASE+'/pidp/auth/session-token'))['access_token']}
    try:
        host=context()
        assert ok(host.request.get(BASE+'/api/org/api/network/replication/status'))['mode']=='primary'
        auth=identity(host,f'invite-host-{run_id}@example.com','Dummy Invitation Host '+run_id)
        group=ok(host.request.post(BASE+'/api/org/api/network/orgs',headers=auth,data={'name':'Dummy Invitation Org '+run_id,'city':'Baltimore','kind':'organization','acknowledgeOwnership':True}))
        email=f'invite-new-{run_id}@example.com'
        page=host.new_page();page.goto(BASE+'/orgs/'+group['slug']+'/dashboard')
        page.get_by_role('searchbox',name='Add people by email or portal member name',exact=True).fill(email)
        with page.expect_response(lambda r:'/invitations/apply' in r.url and r.request.method=='POST') as pending:
            page.get_by_role('button',name=f'Invite {email} by email',exact=True).click()
            page.get_by_role('button',name='Confirm email invitation',exact=True).click()
        invite=ok(pending.value)
        expect(page.get_by_role('status').filter(has_text='Invitation queued.')).to_be_visible()
        members_url=BASE+'/api/org/api/network/orgs/'+group['id']+'/members'
        assert len(ok(host.request.get(members_url,headers=auth)))==1
        # Recipient account is deliberately created only after the invitation.
        recipient=context();identity(recipient,email,'Dummy New Recipient '+run_id)
        invite_url=BASE+'/invitations/'+invite['invitationId']
        wrong=host.request.get(BASE+'/api/org/api/network/invitations/'+invite['invitationId'],headers=auth)
        assert wrong.status==403
        target=recipient.new_page();target.goto(invite_url)
        expect(target.get_by_role('heading',name=group['name'],exact=True)).to_be_visible(timeout=30000)
        assert len(ok(host.request.get(members_url,headers=auth)))==1
        target.get_by_role('button',name='Review acceptance',exact=True).click()
        target.get_by_role('button',name='Confirm acceptance',exact=True).click()
        expect(target.get_by_role('status').filter(has_text='Invitation accepted.')).to_be_visible(timeout=30000)
        assert len(ok(host.request.get(members_url,headers=auth)))==2
        target.reload();expect(target.get_by_role('alert')).to_contain_text('already accepted',timeout=30000)
        print('PASS: dummy org email invite before account creation; verified recipient review/accept; wrong recipient rejected; replay rejected; membership granted only after acceptance. No external mail sent.')
    finally:
        browser.close()
