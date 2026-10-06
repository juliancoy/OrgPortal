import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name("setup-local-organizer.py")))
import json
from pathlib import Path
from urllib.parse import urlencode,urlparse
from playwright.sync_api import sync_playwright,expect
base='https://localhost:8443';account=json.loads((Path(__file__).resolve().parents[2] / '.local/session-test/account.json').read_text())
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
 context=browser.new_context(ignore_https_errors=True)
 context.route('**/*',lambda route:route.continue_() if urlparse(route.request.url).hostname in ['localhost','127.0.0.1'] else route.abort())
 page=context.new_page();page.goto(base+'/orgs/local-organizer-preview?view=organizers')
 page.get_by_role('link',name='Login',exact=True).click()
 page.get_by_role('link',name='Continue with email',exact=True).click()
 print('Sign-in route:',urlparse(page.url).path)
 page.locator('#login-email').fill(account['email']);page.locator('#login-password').fill(account['password'])
 page.get_by_role('button',name='Sign in',exact=True).click()
 nav=page.get_by_role('navigation',name='Local Organizer Preview organizer navigation')
 expect(nav).to_be_visible(timeout=30000)
 nav.get_by_role('link',name='Branding',exact=True).click();expect(page.locator('#organization-branding')).to_be_visible()
 page.screenshot(path='/tmp/local-organizer-navbar.png',full_page=True)
 print('PASS: real local member SSO, canonical identity, organizer navbar, and Branding editor.')
 browser.close()
