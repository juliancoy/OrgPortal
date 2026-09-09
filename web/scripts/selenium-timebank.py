"""Human-flow acceptance against the production UI/Worker with local identity,
SQLite and R2 fixtures. Start timebankServer.ts and Vite (see org-worker README).
"""
import json
import os
import time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(os.environ.get('TIMEBANK_SHOTS', '/tmp/timebank-selenium-after'))
OUT.mkdir(parents=True, exist_ok=True)
REMOTE = os.environ.get('SELENIUM_REMOTE_URL', 'http://127.0.0.1:4446/wd/hub')
COMMUNITY = 'http://bmoretimebank.codecollective.us:5179/p/timebanking'
CENTRAL = 'http://codecollective.us:5179/p/timebanking'
PHOTO = ROOT / 'images' / 'unity5_photo.png'


def browser(width=1440, height=1050):
    options = webdriver.ChromeOptions()
    options.add_argument(f'--window-size={width},{height}')
    options.add_argument('--host-resolver-rules=MAP bmoretimebank.codecollective.us 172.17.0.1, MAP codecollective.us 172.17.0.1')
    options.add_argument('--unsafely-treat-insecure-origin-as-secure=http://bmoretimebank.codecollective.us:5179,http://codecollective.us:5179')
    options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    driver = webdriver.Remote(REMOTE, options=options)
    driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': "window.__timebankErrors=[];window.addEventListener('error',e=>{if(e.message)window.__timebankErrors.push(e.message)});window.addEventListener('unhandledrejection',e=>window.__timebankErrors.push(String(e.reason)))"})
    if width < 640:
        driver.execute_cdp_cmd('Emulation.setDeviceMetricsOverride', {'width': width, 'height': height, 'deviceScaleFactor': 1, 'mobile': True})
    return driver


def find(driver, selector):
    return WebDriverWait(driver, 15).until(EC.visibility_of_element_located((By.CSS_SELECTOR, selector)))


def button(driver, text):
    target = WebDriverWait(driver, 15).until(EC.element_to_be_clickable((By.XPATH, f"//button[normalize-space(.)={json.dumps(text, ensure_ascii=False)}]")))
    target.click()


def field(driver, label, value, tag='input'):
    element = driver.find_element(By.XPATH, f"//label[normalize-space(text())={json.dumps(label, ensure_ascii=False)}]//{tag}")
    element.clear()
    element.send_keys(value)


def status(driver, text):
    WebDriverWait(driver, 15).until(lambda d: text in d.find_element(By.CSS_SELECTOR, '.tb-announcements').text)
    WebDriverWait(driver, 15).until(lambda d: not d.find_elements(By.CSS_SELECTOR, '.tb-button:disabled'))


def login(driver, who, url=COMMUNITY):
    driver.get(url)
    WebDriverWait(driver, 15).until(lambda d: d.find_elements(By.ID, 'email') or d.find_elements(By.CSS_SELECTOR, '.tb-home'))
    if driver.find_elements(By.CSS_SELECTOR, '.tb-signin'):
        find(driver, '.tb-signin').click()
        find(driver, '#email')
    if driver.find_elements(By.ID, 'email'):
        find(driver, '#email').send_keys(f'{who}@example.test')
        find(driver, '#pw').send_keys('wrong-password')
        button(driver, 'Log In')
        WebDriverWait(driver, 10).until(lambda d: 'Invalid credentials' in d.find_element(By.ID, 'user-login-error').text)
        assert '/users/login' in driver.current_url
        find(driver, '#pw').clear()
        find(driver, '#pw').send_keys('timebank-test')
        button(driver, 'Log In')
    find(driver, '.tb-home')


def post(driver, kind, title, photo=True, category='Creative', visibility='public'):
    driver.find_element(By.CSS_SELECTOR, f'button[aria-label="Add {kind}"]').click()
    find(driver, 'dialog[open]')
    field(driver, 'Title', title)
    audience = Select(driver.find_element(By.XPATH, '//label[normalize-space(text())="Visibility"]//select'))
    assert audience.first_selected_option.get_attribute('value') == 'public'
    audience.select_by_value(visibility)
    if photo:
        driver.find_element(By.CSS_SELECTOR, 'input[aria-label="Listing photo"]').send_keys(str(PHOTO))
        preview = find(driver, 'img[alt="Listing photo preview"]')
        WebDriverWait(driver, 10).until(lambda d: preview.get_property('naturalWidth') > 0)
    Select(driver.find_element(By.XPATH, '//label[normalize-space(text())="Category"]//select')).select_by_visible_text(category)
    field(driver, 'Estimated hours', '1.5')
    field(driver, 'Description', 'A friendly introduction to community photography. Bring your camera or phone.', 'textarea')
    field(driver, 'Location or remote', 'Baltimore')
    field(driver, 'How to arrange it', 'Find me in the portal chat. Saturday mornings work best.')
    driver.save_screenshot(str(OUT / f'composer-{kind}.png'))
    button(driver, 'Publish listing')
    status(driver, 'Your listing is live.')
    return find(driver, f'article[aria-label="{title}"]')


def open_listing(driver, title):
    find(driver, f'button[aria-label="View {title}"]').click()
    find(driver, 'dialog[open]')


def record(driver, title, amount):
    button(driver, 'Home')
    button(driver, 'Refresh')
    open_listing(driver, title)
    assert 'Saturday mornings' in find(driver, '.tb-arrange').text
    button(driver, 'Record completed help')
    field(driver, 'Completed hours', amount)
    field(driver, 'Work completed', 'Practiced camera settings and photographed the neighborhood.', 'textarea')
    button(driver, 'Send hours for confirmation')
    status(driver, 'Hours sent to the other member for confirmation.')


def balance(driver, expected):
    driver.find_element(By.CSS_SELECTOR, '.tb-tabs button:nth-child(2)').click()
    WebDriverWait(driver, 15).until(lambda d: d.find_element(By.CSS_SELECTOR, '[data-testid="hours-balance"]').text == f'{expected} h')


def check_layout(driver):
    assert driver.execute_script('return document.documentElement.scrollWidth <= document.documentElement.clientWidth'), 'Horizontal overflow'
    images = driver.find_elements(By.CSS_SELECTOR, '.tb-listing-photo')
    for image in images:
        WebDriverWait(driver, 10).until(lambda d: image.get_property('complete') and image.get_property('naturalWidth') > 0)


def main():
    alice, bob = browser(), browser(390, 844)
    suffix = str(int(time.time()))
    offer, request, untaken = f'Photography walk {suffix}', f'Garden help {suffix}', f'Language practice {suffix}'
    def home(driver):
        button(driver, 'Home')
        find(driver, '.tb-home')
    def uptake(driver, title, action):
        driver.find_element(By.CSS_SELECTOR, f'article[aria-label="{title}"]').find_element(By.XPATH, f'.//button[normalize-space(.)={json.dumps(action)}]').click()
    def sort(driver, value, expected_first):
        Select(find(driver, 'select[aria-label="Sort requests"]')).select_by_value(value)
        WebDriverWait(driver, 10).until(lambda d: d.find_element(By.CSS_SELECTOR, '.tb-column:last-child article').get_attribute('aria-label') == expected_first)
    try:
        login(alice, 'alice')
        assert 'Bmore Timebank' in find(alice, '.tb-shell-brand').text
        assert not alice.find_elements(By.CSS_SELECTOR, '.portal-search, .portal-nav-link, .tb-hero, .tb-wallet')
        assert [x.text for x in alice.find_elements(By.CSS_SELECTOR, '.tb-column-heading h2')] == ['Offers', 'Requests']
        button(alice, 'Admin')
        assert find(alice, '[data-testid="circulation-hours"]').text == '0 h'
        assert find(alice, '[data-testid="rewarded-hours"]').text == '0 h'
        assert not alice.find_elements(By.CSS_SELECTOR, '.tb-pie')
        home(alice)
        alice.find_element(By.CSS_SELECTOR, 'button[aria-label="Add offer"]').click()
        field(alice, 'Title', 'Keep my draft')
        alice.execute_script("window.dispatchEvent(new Event('focus'))")
        assert find(alice, 'dialog[open]').is_displayed()
        find(alice, 'dialog[open]').send_keys(Keys.ESCAPE)
        WebDriverWait(alice, 5).until(lambda d: not d.find_elements(By.CSS_SELECTOR, 'dialog[open]'))
        assert alice.switch_to.active_element.get_attribute('aria-label') == 'Add offer'
        post(alice, 'offer', offer)
        post(alice, 'request', request, photo=False, category='Home & garden')
        post(alice, 'request', untaken, photo=False, category='Learning')
        check_layout(alice)
        find(alice, '.tb-search input').send_keys('no such service')
        assert len(alice.find_elements(By.CSS_SELECTOR, '.tb-empty')) == 2
        find(alice, '.tb-search input').clear()
        # A real input event clears React's controlled search value.
        find(alice, '.tb-search input').send_keys(Keys.SPACE, Keys.BACKSPACE)
        login(bob, 'bob')
        assert not bob.find_elements(By.XPATH, '//button[normalize-space(.)="Admin"]')
        uptake(bob, request, 'Take up request')
        status(bob, 'You have taken up this request.')
        row=find(bob, f'article[aria-label="{request}"]')
        assert '1 person took this up' in row.text
        balance(bob, '0')
        home(bob)
        uptake(bob, request, 'Withdraw')
        status(bob, 'You withdrew')
        assert '0 people took this up' in find(bob, f'article[aria-label="{request}"]').text
        uptake(bob, request, 'Take up request')
        status(bob, 'You have taken up this request.')
        sort(bob, 'most', request)
        sort(bob, 'least', untaken)
        sort(bob, 'newest', untaken)
        sort(bob, 'most', request)
        check_layout(bob)
        rects=bob.execute_script("return [...document.querySelectorAll('.tb-column')].map(e=>({x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right}))")
        assert rects[1]['x'] >= rects[0]['right'], 'Keep the two-column board on mobile'
        bob.save_screenshot(str(OUT / 'mobile-board.png'))
        button(alice, 'Refresh')
        WebDriverWait(alice, 10).until(lambda d: '1 person took this up' in d.find_element(By.CSS_SELECTOR, f'article[aria-label="{request}"]').text)
        alice.save_screenshot(str(OUT / 'desktop-board.png'))
        record(bob, offer, '1.25')
        balance(bob, '0')
        button(alice, 'Refresh')
        alice.find_element(By.CSS_SELECTOR, '.tb-tabs button:nth-child(2)').click()
        button(alice, 'Confirm hours'); status(alice, 'Exchange confirmed.')
        balance(alice, '1.25')
        record(bob, request, '0.5')
        button(alice, 'Refresh'); button(alice, 'Confirm hours'); status(alice, 'Exchange confirmed.')
        balance(alice, '0.75')
        button(alice, 'Admin')
        assert find(alice, '[data-testid="circulation-hours"]').text == '0.75 h'
        assert find(alice, '[data-testid="rewarded-hours"]').text == '1.75 h'
        chart=find(alice, '.tb-pie')
        assert len(chart.find_elements(By.CSS_SELECTOR, 'path')) == 2
        assert 'Creative' in find(alice, '.tb-category-chart').text
        assert 'Home & garden' in find(alice, '.tb-category-chart').text
        rankings=alice.find_elements(By.CSS_SELECTOR, '.tb-analytics-rankings section')
        assert 'Bob' in rankings[0].find_element(By.CSS_SELECTOR, 'tbody tr:first-child').text
        assert 'Alice' in rankings[1].find_element(By.CSS_SELECTOR, 'tbody tr:first-child').text
        alice.save_screenshot(str(OUT / 'admin-analytics.png'))
        # Pending, declined and canceled hours do not inflate analytics.
        record(bob, request, '0.25')
        button(alice, 'Refresh')
        assert find(alice, '[data-testid="rewarded-hours"]').text == '1.75 h'
        alice.find_element(By.CSS_SELECTOR, '.tb-tabs button:nth-child(2)').click()
        button(alice, 'Decline'); status(alice, 'Exchange declined.')
        record(bob, request, '0.25'); button(bob, 'Cancel exchange'); status(bob, 'Exchange canceled.')
        balance(bob, '-0.75')
        home(bob)
        assert '1 person took this up' in find(bob, f'article[aria-label="{request}"]').text
        assert 'You helped' in find(bob, f'article[aria-label="{request}"]').text
        home(alice); open_listing(alice, offer); button(alice, 'Close listing'); status(alice, 'Listing closed.')
        button(bob, 'Refresh')
        WebDriverWait(bob, 10).until(lambda d: not d.find_elements(By.CSS_SELECTOR, f'article[aria-label="{offer}"]'))
        alice.find_element(By.CSS_SELECTOR, '.tb-mine input').click()
        open_listing(alice, offer); button(alice, 'Reopen listing'); status(alice, 'Listing reopened.')
        button(alice, 'Admin'); button(alice, 'Community settings')
        field(alice, 'Welcome message', 'Neighbors make Baltimore better, one hour at a time.')
        button(alice, 'Save settings'); status(alice, 'Community settings saved.')
        login(alice, 'alice', CENTRAL)
        assert not alice.find_elements(By.CSS_SELECTOR, f'article[aria-label="{offer}"]')
        button(alice, 'Admin')
        assert find(alice, '[data-testid="rewarded-hours"]').text == '0 h'
        assert not alice.find_elements(By.CSS_SELECTOR, '.tb-pie')
        login(alice, 'alice', COMMUNITY)
        balance(alice, '0.75')
        button(alice, 'Admin')
        alice.execute_script("document.documentElement.dataset.theme='dark'")
        check_layout(alice);find(alice, '.tb-pie')
        alice.save_screenshot(str(OUT / 'dark-analytics.png'))
        alice.execute_cdp_cmd('Emulation.setDeviceMetricsOverride', {'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
        check_layout(alice)
        alice.save_screenshot(str(OUT / 'mobile-analytics.png'))
        errors=[error for driver in [alice,bob] for error in driver.execute_script('return window.__timebankErrors || []')]
        assert not errors, errors
        result={'result':'passed','checks':['dedicated two-column home on desktop and mobile','photo upload','request uptake and withdrawal','all request sorting modes','confirmed hours and request participant deduplication','admin circulation category pie and leaderboards','empty analytics','admin-only navigation','community isolation','draft and dialog focus','dark and mobile analytics'], 'screenshots':str(OUT)}
        (OUT/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
    except Exception:
        for name, driver in [('alice',alice),('bob',bob)]:
            driver.save_screenshot(str(OUT/f'failure-{name}.png'))
            (OUT/f'failure-{name}.txt').write_text(driver.find_element(By.TAG_NAME,'body').text)
        raise
    finally:
        alice.quit();bob.quit()

if __name__ == '__main__':
    main()
