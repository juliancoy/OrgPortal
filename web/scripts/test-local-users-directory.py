"""Anonymous local Docker check for the shared users/people directory."""
from playwright.sync_api import sync_playwright, expect
origin='https://localhost:8443'
rows=[{'user_id':'directory-fixture-one','user_name':'Directory Fixture One','contact_slug':'directory-fixture-one'},
      {'user_id':'directory-fixture-two','user_name':'Directory Fixture Two','contact_slug':'directory-fixture-two'}]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True)
    context=browser.new_context(ignore_https_errors=True)
    context.route('**/api/org/api/network/users/public?*',lambda route:route.fulfill(json=rows))
    page=context.new_page()
    snapshots=[]
    for path in ['/users','/users/','/people','/people/']:
        response=page.goto(origin+path,wait_until='domcontentloaded')
        assert response.status==200,(path,response.status)
        expect(page.get_by_role('heading',name='People',exact=True,level=1)).to_be_visible(timeout=60000)
        grid=page.locator('.people-directory-grid')
        expect(grid.get_by_role('heading',name='Directory Fixture One',exact=True)).to_be_visible(timeout=30000)
        expect(grid.get_by_role('heading',name='Directory Fixture Two',exact=True)).to_be_visible()
        snapshots.append(grid.inner_text())
        expect(page.locator('link[rel="canonical"]')).to_have_attribute('href',origin+'/people')
    assert all(content==snapshots[0] for content in snapshots)
    browser.close()
print('PASS local Docker: users and people, with and without trailing slash, render the same directory and canonical URL.')
