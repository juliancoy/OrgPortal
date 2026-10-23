#!/usr/bin/env python3
"""Organization poster clickthrough with isolated local accounts and fixtures."""
import secrets, uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from local_browser_test_support import BASE, preflight, verification_link

preflight()
run = uuid.uuid4().hex[:10]
def good(response):
    assert response.ok, f'{response.status}: {response.text()[:200]}'
    return response.json() if 'application/json' in response.headers.get('content-type', '') else {}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
    def context():
        ctx = browser.new_context(ignore_https_errors=True, viewport={'width':1280, 'height':1000})
        ctx.route('**/*', lambda route: route.continue_() if urlparse(route.request.url).hostname in {'localhost','127.0.0.1'} else route.abort())
        return ctx
    owner = context()
    assert good(owner.request.get(BASE+'/api/org/api/network/replication/status'))['mode'] == 'primary'
    email, password = f'org-poster-{run}@example.com', secrets.token_urlsafe(32)
    good(owner.request.post(BASE+'/pidp/auth/register', data={'email':email,'password':password,'full_name':'Dummy Poster Owner '+run}))
    assert owner.request.get(verification_link(email), max_redirects=0).status == 303
    good(owner.request.post(BASE+'/pidp/auth/session/login', form={'username':email,'password':password}, headers={'Origin':BASE}))
    auth = {'Authorization':'Bearer '+good(owner.request.get(BASE+'/pidp/auth/session-token'))['access_token']}
    good(owner.request.get(BASE+'/api/org/api/accounts/me',headers=auth))
    def org(label):
        return good(owner.request.post(BASE+'/api/org/api/network/orgs',headers=auth,data={'name':f'Dummy {label} Poster {run}','description':'Build together and connect with our community.','city':'Baltimore','kind':'organization','acknowledgeOwnership':True}))
    a, b = org('Alpha'), org('Beta')
    events=[]
    for i in range(9):
        title=f'FixtureEvent{i} {run}'
        starts=(datetime.now(timezone.utc)+timedelta(days=30+i if i<8 else -30)).isoformat()
        event=good(owner.request.post(BASE+'/api/org/api/network/events',headers=auth,data={'title':title,'host_type':'org','host_org_id':(b if i==7 else a)['id'],'starts_at':starts,'location':f'FixtureVenue{i}'}))
        if i<7: events.append(event)
    guest=context(); page=guest.new_page()
    page.goto(BASE+'/orgs/'+a['slug'],wait_until='domcontentloaded')
    page.get_by_role('tab',name='Poster',exact=True).click(timeout=30000)
    expect(page).to_have_url(BASE+'/orgs/'+a['slug']+'?tab=poster')
    expect(page.get_by_role('heading',name='Organization poster',exact=True)).to_be_visible()
    preview=page.locator('.event-poster-preview')
    art=preview.locator('svg').first
    expect(art).to_be_visible(timeout=30000)
    expect(art).not_to_contain_text('Date to be announced')
    check=page.get_by_role('checkbox',name='Include all upcoming hosted events')
    check.check()
    expect(page.get_by_role('group',name='Poster pages')).to_contain_text('7 upcoming events',timeout=30000)
    svg_text=''; pages=0
    while True:
        expect(art).to_be_visible(timeout=30000)
        svg_text+=art.text_content()
        pages+=1
        next_page=page.get_by_role('button',name='Next page',exact=True)
        if next_page.is_disabled(): break
        next_page.click()
    assert pages>1
    for i in range(7): assert f'FixtureEvent{i}' in svg_text and f'FixtureVenue{i}' in svg_text
    assert 'FixtureEvent7' not in svg_text and 'FixtureEvent8' not in svg_text
    # Both export paths produce real artifacts, with current-page filenames.
    with page.expect_download() as exported: page.get_by_role('button',name='SVG',exact=True).click()
    download=exported.value
    assert f'page-{pages}' in download.suggested_filename
    assert 'Scan to connect' in open(download.path()).read()
    with page.expect_download() as exported: page.get_by_role('button',name='PNG',exact=True).click()
    assert open(exported.value.path(),'rb').read(8)==b'\x89PNG\r\n\x1a\n'
    with page.expect_popup() as opened: page.get_by_role('button',name='Print all pages',exact=True).click()
    popup=opened.value
    expect(popup.locator('img')).to_have_count(pages,timeout=30000)
    popup.close()
    page.reload(wait_until='domcontentloaded')
    expect(check).to_be_checked(timeout=30000)
    expect(art).to_be_visible(timeout=30000)
    for format_label in ['Social','4 x 6','Letter 2 × 2','8.5 x 11']:
        page.get_by_role('button',name=format_label,exact=True).click()
        expect(art).to_be_visible(timeout=30000)
    page.get_by_role('combobox',name='Background',exact=True).select_option('gradient')
    page.get_by_role('button',name='Dark',exact=True).click()
    expect(art).to_be_visible(timeout=30000)
    for width in [1280,390]:
        page.set_viewport_size({'width':width,'height':1000})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=f'/tmp/organization-poster-{width}.png',full_page=True)
    page.goto(BASE+'/orgs/'+b['slug']+'?tab=poster',wait_until='domcontentloaded')
    expect(check).not_to_be_checked(timeout=30000)
    check.check()
    expect(page.get_by_role('group',name='Poster pages')).to_contain_text('1 upcoming events',timeout=30000)
    expect(art).to_contain_text('FixtureEvent7',timeout=30000)
    expect(art).not_to_contain_text('FixtureEvent0')
    # Existing event posters remain a separate editor and keep their own controls.
    page.goto(BASE+'/events/'+events[0]['slug'],wait_until='domcontentloaded')
    page.get_by_role('tab',name='Poster',exact=True).click(timeout=30000)
    expect(page.get_by_role('heading',name='Event poster',exact=True)).to_be_visible()
    expect(page.get_by_role('group',name='Poster format')).to_be_visible()
    expect(check).to_have_count(0)
    browser.close()
print('PASS: org Poster navigation, all hosted events across pages, past/other-org exclusion, SVG/PNG, print all, saved setting, formats, mobile, org isolation, existing event poster')
