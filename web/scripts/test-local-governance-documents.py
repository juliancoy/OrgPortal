#!/usr/bin/env python3
"""Real local UI acceptance test; fixture roles are seeded only in Docker D1."""
import json
import os
import secrets
import subprocess
import uuid
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from local_browser_test_support import BASE, ROOT, preflight, verification_link

WORKER = os.environ.get('ONBOARDING_ORG_CONTAINER', 'bmoremedtech-org')
PATH = '/governance/documents/lifetech-constitution'
API = '/api/org/api/governance/documents/lifetech-constitution'
run_id = uuid.uuid4().hex
preflight()
worker = json.loads(subprocess.check_output(['docker', 'inspect', WORKER]))[0]
assert '--local' in ' '.join(worker['Config']['Cmd']), 'Worker must run with local storage'

def sql(text):
    result = subprocess.run(['docker', 'exec', '-e', 'WRANGLER_SEND_METRICS=false', WORKER, 'node_modules/.bin/wrangler', 'd1', 'execute', 'org', '--local', '--command', text], capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, 'Local governance fixture operation failed'

accounts = []
ticket_id = None
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE', '/usr/bin/google-chrome'), headless=True, args=['--no-sandbox'])
    try:
        for role in ['member', 'administrator', 'owner']:
            context = browser.new_context(ignore_https_errors=True, viewport={'width':1280,'height':900})
            context.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in {'localhost','127.0.0.1'} else route.abort())
            account = {'email':f'governance-{role}-{run_id}@example.com','password':secrets.token_urlsafe(32),'full_name':'Local Governance '+role}
            registration = context.request.post(BASE+'/pidp/auth/register',data=account,max_redirects=0)
            assert registration.ok
            identity = registration.json()['id']
            assert all(c in '0123456789abcdef-' for c in identity), 'Unexpected local identity format'
            verify = context.request.get(verification_link(account['email']),max_redirects=0)
            assert verify.status == 303 and 'error=' not in verify.headers.get('location','')
            assert context.request.post(BASE+'/pidp/auth/session/login',form={'username':account['email'],'password':account['password']},headers={'Origin':BASE},max_redirects=0).ok
            accounts.append((context,identity,role))
        sql("INSERT OR IGNORE INTO organizations(id,name,slug,tags,city) VALUES('local-lifetech-governance','LifeTech','lifetech','[]','Baltimore')")
        doc = accounts[0][0].request.get(BASE+API).json()
        organization_id = doc['organizationId']
        assert organization_id and "'" not in organization_id
        for _,identity,role in accounts:
            sql(f"INSERT INTO organization_memberships(organization_id,user_id,user_name,role,status) VALUES('{organization_id}','{identity}','Local governance test','{role}','active')")
        member = accounts[0][0].new_page()
        member.goto(BASE+'/onboarding')
        expect(member.locator('#constitution a')).to_have_attribute('href',PATH,timeout=30000)
        member.locator('#constitution a').click()
        expect(member.get_by_role('heading',name='LifeTech Constitution and Bylaws',exact=True)).to_be_visible()
        assert member.locator('h2').filter(has_text='Title ').count() == 9
        expect(member.get_by_role('button',name='Edit section',exact=True)).to_have_count(9)
        member.locator('#overview').get_by_role('button',name='Edit section',exact=True).click()
        expect(member.locator('#overview').get_by_label('Complete replacement text',exact=True)).to_have_value(doc['sections'][0]['text'])
        title = 'Browser acceptance '+run_id
        member.get_by_label('Ticket title',exact=True).fill(title)
        member.get_by_label('Reason for the change',exact=True).fill('Verify the local proposal and discussion workflow.')
        member.get_by_label('Complete replacement text',exact=True).fill(doc['sections'][0]['text']+'\n\nLocal test suggestion '+run_id)
        member.get_by_role('button',name='Review change ticket',exact=True).click()
        expect(member.get_by_role('dialog')).to_be_visible()
        assert not any(t['title'] == title for t in accounts[0][0].request.get(BASE+API+'/tickets').json()['tickets']), 'Preview unexpectedly created a ticket'
        member.get_by_role('button',name='Confirm action',exact=True).click()
        annotation = member.locator('#overview .draft-edit-added').first
        expect(annotation).to_contain_text('Local test suggestion')
        annotation.hover()
        assert 'Suggested by' in annotation.get_attribute('title') and 'Section edit history' in annotation.get_attribute('title')
        assert title in annotation.get_attribute('title')
        annotation.focus()
        member.keyboard.press('Enter')
        expect(member.locator('#overview .draft-history')).to_have_attribute('open','')
        expect(member.locator('#overview .draft-history')).to_contain_text('proposed')
        member.locator('#overview').get_by_label('Suggested changes for Title I: Overview').select_option('')
        expect(member.locator('#overview .draft-edit-added')).to_have_count(0)
        member.locator('#tickets').get_by_role('link',name=title,exact=True).click(timeout=15000)
        ticket_id = member.url.rsplit('/',1)[-1]
        expect(member.get_by_role('heading',name=title,exact=True)).to_be_visible()
        second = accounts[1][0].new_page();second.goto(BASE+PATH+'/tickets/'+ticket_id)
        second.get_by_role('button',name='Second motion',exact=True).click()
        second.get_by_role('button',name='Confirm action',exact=True).click()
        expect(second.locator('.governance-draft')).to_contain_text('seconded')
        chair = accounts[2][0].new_page();chair.goto(BASE+PATH+'/tickets/'+ticket_id)
        chair.get_by_label('Chair’s statement of the exact question').fill('The proposed replacement wording is the pending question.')
        chair.get_by_role('button',name='State question',exact=True).click()
        chair.get_by_role('button',name='Confirm action',exact=True).click()
        expect(chair.locator('.governance-draft')).to_contain_text('discussion')
        chair.get_by_label('Chair’s record: notice delivered to every organizer and debate exhausted').fill('Attempt to open too early for the acceptance test.')
        chair.get_by_role('button',name='Review opening ballot',exact=True).click()
        chair.get_by_role('button',name='Confirm action',exact=True).click()
        expect(chair.get_by_role('alert')).to_contain_text('Seven full days')
        member.reload()
        member.get_by_label('Comment',exact=True).fill('Preserve the LifeTech mission in any adopted change.')
        member.get_by_role('button',name='Review comment',exact=True).click()
        member.get_by_role('button',name='Confirm action',exact=True).click()
        expect(member.get_by_role('dialog')).to_have_count(0)
        expect(member.locator('article').get_by_text('Preserve the LifeTech mission in any adopted change.',exact=True)).to_be_visible()
        expect(member.get_by_role('button',name='Vote yes',exact=True)).to_have_count(0)
        # Advance only this test ticket's timestamps in local D1; production timing remains enforced.
        assert ticket_id.startswith('mot-') and all(c in '0123456789abcdef-' for c in ticket_id[4:])
        sql(f"UPDATE governance_motions SET created_at='2020-01-01T00:00:00.000Z' WHERE id='{ticket_id}'")
        chair.reload()
        chair.get_by_label('Chair’s record: notice delivered to every organizer and debate exhausted').fill('Local test: every organizer received the exact wording and debate is exhausted.')
        chair.get_by_role('button',name='Review opening ballot',exact=True).click()
        chair.get_by_role('button',name='Confirm action',exact=True).click()
        expect(chair.locator('.governance-draft')).to_contain_text('voting')
        for voter in [chair,second]:
            voter.reload()
            voter.get_by_role('button',name='Vote yes',exact=True).click()
            voter.get_by_role('button',name='Confirm action',exact=True).click()
            expect(voter.get_by_role('dialog')).to_have_count(0)
        member.reload()
        expect(member.get_by_role('button',name='Vote yes',exact=True)).to_have_count(0)
        sql(f"UPDATE governance_motions SET voting_deadline='2020-01-01T00:00:00.000Z' WHERE id='{ticket_id}'")
        chair.reload()
        chair.get_by_role('button',name='Review result',exact=True).click()
        chair.get_by_role('button',name='Confirm action',exact=True).click()
        expect(chair.get_by_text(f"Adopted into draft revision {doc['version']+1}.",exact=True)).to_be_visible()
        member.reload()
        expect(member.locator('.governance-draft')).to_contain_text('passed')
        member.screenshot(path=str(ROOT/'governance-ticket-desktop.png'),full_page=True)
        member.set_viewport_size({'width':390,'height':844})
        member.screenshot(path=str(ROOT/'governance-ticket-mobile.png'),full_page=True)
        assert member.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile ticket overflows'
        member.goto(BASE+PATH)
        expect(member.get_by_role('heading',name='LifeTech Constitution and Bylaws',exact=True)).to_be_visible()
        assert member.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile constitution overflows'
        member.screenshot(path=str(ROOT/'lifetech-constitution-mobile.png'),full_page=True)
        expect(member.locator('#overview .draft-edit')).to_have_count(0)
        member.locator('#overview .draft-history summary').first.click()
        expect(member.locator('#overview .draft-history')).to_contain_text('passed')
        print('PASS: section editing, colored suggestions, hover attribution, keyboard history, organizer adoption, and mobile layouts', flush=True)
        # Exercise ratification on this run's amended local draft, then remove
        # the test adoption record during cleanup. No real constitution is ratified.
        chair.goto(BASE+PATH)
        candidate = accounts[2][0].request.get(BASE+API).json()
        assert candidate['ratification'] is None
        chair.get_by_label('Reason to ratify this revision',exact=True).fill('Local test only: validate the adoption pathway.')
        chair.get_by_label('Prior organizer agreement and meeting record',exact=True).fill('Local test meeting: organizers independently agreed to organizer voting, majority participation quorum, two-thirds approval, seven-day notice and a 24-hour electronic ballot.')
        chair.get_by_role('button',name='Review ratification ticket',exact=True).click()
        expect(chair.get_by_role('dialog')).to_contain_text('Ratify all nine titles')
        chair.get_by_role('button',name='Confirm action',exact=True).click()
        ratification_title = f"Ratify LifeTech Constitution — revision {candidate['version']}"
        chair.get_by_role('link',name=ratification_title,exact=True).click(timeout=15000)
        ratification_id = chair.url.rsplit('/',1)[-1]
        assert ratification_id.startswith('mot-') and all(c in '0123456789abcdef-' for c in ratification_id[4:])
        expect(chair.get_by_role('heading',name='Constitution submitted for ratification',exact=True)).to_be_visible()
        assert chair.locator('h3').filter(has_text='Title ').count() == 9
        second.goto(BASE+PATH+'/tickets/'+ratification_id)
        second.get_by_role('button',name='Second motion',exact=True).click()
        second.get_by_role('button',name='Confirm action',exact=True).click()
        expect(second.locator('.governance-draft')).to_contain_text('seconded')
        chair.reload()
        chair.get_by_label('Chair’s statement of the exact question').fill('Local test: ratify the full frozen revision, effective immediately upon adoption.')
        chair.get_by_role('button',name='State question',exact=True).click()
        chair.get_by_role('button',name='Confirm action',exact=True).click()
        expect(chair.locator('.governance-draft')).to_contain_text('discussion')
        expect(chair.get_by_role('button',name='Review notice record',exact=True)).to_be_disabled()
        chair.get_by_label('Notice delivery record for every organizer').fill('Local test: every organizer received the full text and agreed ballot procedure.')
        chair.get_by_role('checkbox',name='I confirm the prior organizer agreement independently authorized this ratification procedure.').check()
        chair.get_by_role('button',name='Review notice record',exact=True).click()
        chair.get_by_role('button',name='Confirm action',exact=True).click()
        expect(chair.get_by_text('Full-candidate notice recorded:',exact=False)).to_be_visible()
        chair.get_by_label('Chair’s record: notice delivered to every organizer and debate exhausted').fill('Local test attempt before the recorded notice period expires.')
        chair.get_by_role('button',name='Review opening ballot',exact=True).click()
        chair.get_by_role('button',name='Confirm action',exact=True).click()
        expect(chair.get_by_role('alert')).to_contain_text('Seven full days')
        sql(f"UPDATE governance_motions SET ratification_notice_at='2020-01-01T00:00:00.000Z' WHERE id='{ratification_id}'")
        chair.reload()
        chair.get_by_label('Chair’s record: notice delivered to every organizer and debate exhausted').fill('Local test: notice elapsed and debate exhausted.')
        chair.get_by_role('button',name='Review opening ballot',exact=True).click()
        chair.get_by_role('button',name='Confirm action',exact=True).click()
        expect(chair.locator('.governance-draft')).to_contain_text('voting')
        for voter in [chair,second]:
            voter.goto(BASE+PATH+'/tickets/'+ratification_id)
            voter.get_by_role('button',name='Vote yes',exact=True).click()
            voter.get_by_role('button',name='Confirm action',exact=True).click()
            expect(voter.get_by_role('dialog')).to_have_count(0)
        sql(f"UPDATE governance_motions SET voting_deadline='2020-01-01T00:00:00.000Z' WHERE id='{ratification_id}'")
        chair.reload()
        chair.get_by_role('button',name='Review result',exact=True).click()
        chair.get_by_role('button',name='Confirm action',exact=True).click()
        expect(chair.get_by_text('Constitution ratified. Effective',exact=False)).to_be_visible()
        member.goto(BASE+PATH)
        expect(member.locator('.governance-draft')).to_contain_text('Ratified constitution')
        member.get_by_role('link',name='Read the adoption record and original adopted text',exact=True).click()
        expect(member.get_by_role('heading',name='Constitution submitted for ratification',exact=True)).to_be_visible()
        member.screenshot(path=str(ROOT/'lifetech-ratification-mobile.png'),full_page=True)
        assert member.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Ratification ticket overflows at mobile width'
        print('PASS: full-text ratification, prior agreement, notice, organizer ballot, adoption record, effective date, and mobile layout', flush=True)
    except Exception:
        if 'member' in locals(): member.screenshot(path=str(ROOT/'governance-failure.png'),full_page=True)
        raise
    finally:
        # Remove only this run's generated proposals, adoption records and roles.
        if accounts:
            identities = ','.join("'"+identity+"'" for _,identity,_ in accounts)
            owned = f"SELECT id FROM governance_motions WHERE proposer_id IN ({identities})"
            for table in ['governance_document_ratifications','governance_document_revisions','governance_votes','governance_motion_events','governance_comments']:
                sql(f"DELETE FROM {table} WHERE motion_id IN ({owned})")
            sql(f"DELETE FROM governance_motions WHERE proposer_id IN ({identities})")
            sql(f"DELETE FROM organization_memberships WHERE user_id IN ({identities})")
        browser.close()
