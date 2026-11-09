"""Anonymous synthetic search fixture; no login, profile writes or real-person data."""
from playwright.sync_api import sync_playwright, expect

origin = 'https://localhost:8443'
rows = [{'user_id': 'fixture-account-1', 'user_name': 'Fixture Person One', 'contact_slug': 'fixture-person-one'},
        {'user_id': 'fixture-account-2', 'user_name': 'Fixture Person Two', 'contact_slug': 'fixture-person-two'}]
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
    context = browser.new_context(ignore_https_errors=True)
    context.route('**/api/org/api/network/search?*', lambda route: route.fulfill(json={'orgs': [], 'events': [], 'users': rows}))
    page = context.new_page()
    page.goto(origin + '/search?q=fixture&scope=people', wait_until='domcontentloaded')
    first = page.locator('#search-people').get_by_role('link', name='Fixture Person One', exact=True)
    expect(first).to_have_attribute('href', '/users/fixture-person-one', timeout=60000)
    expect(page.locator('#search-people').get_by_role('link', name='Fixture Person Two', exact=True)).to_have_attribute('href', '/users/fixture-person-two')
    first.click()
    expect(page).to_have_url(origin + '/users/fixture-person-one')
    page.goto(origin + '/search?q=fixture&scope=people', wait_until='domcontentloaded')
    field = page.locator('.portal-header input.portal-search-input')
    field.fill('fixture')
    options = page.locator('.portal-search-group[aria-label="People"] a')
    expect(options.first).to_have_attribute('href', '/users/fixture-person-one', timeout=30000)
    expect(options.nth(1)).to_have_attribute('href', '/users/fixture-person-two')
    field.press('ArrowDown')
    field.press('ArrowDown')
    field.press('Enter')
    expect(page).to_have_url(origin + '/users/fixture-person-two')
    assert page.locator('a[href*="/users/undefined"]').count() == 0
    browser.close()
print('PASS: local search results click and header keyboard selection resolve distinct contact_slug profiles.')
