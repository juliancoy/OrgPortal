#!/usr/bin/env python3
"""Exercise poll assignments and persistent task notifications on local Docker only."""
import json
import secrets
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = 'https://localhost:8443'
ROOT = Path(__file__).resolve().parents[2] / '.local' / 'session-test'
ROOT.mkdir(parents=True, exist_ok=True)


def account(kind, name):
    path = ROOT / f'tasks-{kind}.json'
    if not path.exists():
        path.write_text(json.dumps({'email': f'tasks-{kind}@example.com', 'password': secrets.token_urlsafe(32), 'full_name': name}))
        path.chmod(0o600)
    return json.loads(path.read_text())


def login(browser, credentials):
    context = browser.new_context(ignore_https_errors=True, timezone_id='America/New_York')
    context.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname == 'localhost' else route.abort())
    assert context.request.get(BASE + '/pidp/health').json()['status'] == 'ok'
    assert context.request.get(BASE + '/api/org/health').ok
    response = context.request.post(BASE + '/pidp/auth/register', data=credentials)
    assert response.status in (200, 201, 409), response.status
    response = context.request.post(BASE + '/pidp/auth/session/login', form={'username': credentials['email'], 'password': credentials['password']}, headers={'Origin': BASE})
    assert response.ok, response.status
    token = context.request.get(BASE + '/pidp/auth/session-token').json()['access_token']
    headers = {'Authorization': 'Bearer ' + token}
    assert context.request.get(BASE + '/api/org/api/network/contact/me', headers=headers).ok
    return context, headers


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    try:
        owner, owner_headers = login(browser, account('owner', 'Task Preview Organizer'))
        member, member_headers = login(browser, account('member', 'Task Preview Member'))
        page = owner.new_page()
        page.goto(BASE + '/availability')
        expect(page.get_by_label('Poll title')).to_be_visible(timeout=30000)
        title = 'Task queue acceptance ' + secrets.token_hex(3)
        page.get_by_label('Poll title').fill(title)
        page.get_by_label('First date').fill('2026-10-10')
        page.get_by_label('Last date').fill('2026-10-12')
        page.get_by_role('button', name='Create poll', exact=True).click()
        expect(page.get_by_role('heading', name=title, exact=True)).to_be_visible()
        url = page.url
        page.get_by_label('Find portal members').fill('Task Preview Member')
        checkbox = page.get_by_role('checkbox', name='Task Preview Member', exact=True)
        expect(checkbox).to_be_visible()
        checkbox.check()
        page.get_by_role('button', name='Assign to 1 person', exact=True).click()
        expect(page.get_by_role('status')).to_contain_text('Invitations assigned')
        expect(page.get_by_text('1 person invited · Link access is open', exact=False)).to_be_visible()
        recipient = member.new_page()
        recipient.goto(BASE + '/availability')
        expect(recipient.get_by_role('button', name='Create poll', exact=True)).to_be_visible(timeout=30000)
        recipient.get_by_role('button', name='Notifications', exact=False).click()
        queue = recipient.get_by_role('region', name='Your task queue')
        task = queue.get_by_role('link', name='Respond to ' + title, exact=True)
        expect(task).to_be_visible()
        assert member.request.post(BASE + '/api/org/api/network/notifications/read', headers=member_headers).ok
        recipient.reload()
        recipient.get_by_role('button', name='Notifications', exact=False).click()
        expect(task).to_be_visible()
        queue.get_by_label('Add a personal task').fill('Review agenda')
        queue.get_by_role('button', name='Add task', exact=True).click()
        expect(queue.get_by_role('button', name='Complete Review agenda', exact=True)).to_be_visible()
        task.click()
        expect(recipient.get_by_role('heading', name=title, exact=True)).to_be_visible()
        recipient.locator('thead th button').first.click()
        recipient.get_by_role('button', name='Save availability', exact=True).click()
        expect(recipient.get_by_role('status')).to_contain_text('Availability saved.')
        recipient.get_by_role('button', name='Notifications', exact=False).click()
        expect(queue.get_by_role('link', name='Respond to ' + title, exact=True)).to_have_count(0)
        queue.get_by_role('button', name='Complete Review agenda', exact=True).click()
        expect(queue.get_by_text('No unfinished tasks.', exact=True)).to_be_visible()
        recipient.reload()
        recipient.get_by_role('button', name='Notifications', exact=False).click()
        expect(queue.get_by_text('No unfinished tasks.', exact=True)).to_be_visible()
        poll_id = url.rsplit('/', 1)[-1]
        assert member.request.get(BASE + f'/api/org/api/availability/{poll_id}/invites', headers=member_headers).status == 403
        roster = owner.request.get(BASE + f'/api/org/api/availability/{poll_id}/invites', headers=owner_headers).json()
        assert roster['invites'][0]['responded'] == 1
        owner.close()
        member.close()
        print('PASS: local poll assignment, invited count, persistent notification tasks, save completion, personal tasks and private roster')
    finally:
        browser.close()
