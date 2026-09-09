"""Public homepage and listing visibility against real Worker routes and SQLite.

Use the same fresh fixture, Vite server and Selenium setup as selenium-timebank.py.
"""
import importlib.util
import json
import time
from pathlib import Path
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import Select, WebDriverWait

spec = importlib.util.spec_from_file_location('flow', Path(__file__).with_name('selenium-timebank.py'))
flow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flow)


def absent(driver, title):
    assert not driver.find_elements(By.CSS_SELECTOR, f'article[aria-label="{title}"]'), title


def close(driver):
    flow.find(driver, 'dialog[open]').send_keys(Keys.ESCAPE)
    WebDriverWait(driver, 5).until(lambda d: not d.find_elements(By.CSS_SELECTOR, 'dialog[open]'))


def community_board(driver):
    WebDriverWait(driver, 10).until(lambda d:
        'mine=true' not in d.current_url
        and d.find_elements(By.CSS_SELECTOR, '.tb-mine input')
        and not d.find_element(By.CSS_SELECTOR, '.tb-mine input').is_selected())


def main():
    alice, bob, guest = flow.browser(), flow.browser(390, 844), flow.browser()
    suffix = str(int(time.time()))
    public = [f'{member} {kind} {suffix}' for member in ['Alice', 'Bob'] for kind in ['offer', 'request']]
    restricted = [f'Members {kind} {suffix}' for kind in ['offer', 'request']]
    try:
        flow.login(alice, 'alice')
        flow.post(alice, 'offer', public[0])
        flow.post(alice, 'request', public[1], photo=False)
        flow.post(alice, 'offer', restricted[0], visibility='members')
        flow.post(alice, 'request', restricted[1], photo=False, visibility='members')
        flow.login(bob, 'bob')
        for title in public[:2] + restricted:
            flow.find(bob, f'article[aria-label="{title}"]')
        private_photo = flow.find(bob, f'article[aria-label="{restricted[0]}"] img')
        WebDriverWait(bob, 10).until(lambda d: private_photo.get_property('naturalWidth') > 0)
        assert private_photo.get_attribute('src').startswith('blob:')

        # Publishing from My listings returns to the full community board.
        bob.find_element(By.CSS_SELECTOR, '.tb-mine input').click()
        absent(bob, public[0])
        flow.post(bob, 'offer', public[2], photo=False)
        community_board(bob)
        flow.find(bob, f'article[aria-label="{public[0]}"]')
        flow.post(bob, 'request', public[3], photo=False)
        flow.button(alice, 'Refresh')
        for driver in [alice, bob]:
            for title in public + restricted:
                flow.find(driver, f'article[aria-label="{title}"]')
            driver.find_element(By.CSS_SELECTOR, '.tb-mine input').click()
            flow.find(driver, '#timebank-search').send_keys('no matching listing')
            flow.button(driver, 'My hours')
            flow.button(driver, 'Home')
            community_board(driver)
            assert flow.find(driver, '#timebank-search').get_attribute('value') == ''
            for title in public:
                flow.find(driver, f'article[aria-label="{title}"]')
            driver.find_element(By.CSS_SELECTOR, '.tb-mine input').click()
            flow.find(driver, '.tb-shell-brand').click()
            community_board(driver)
            flow.check_layout(driver)
        alice.save_screenshot(str(flow.OUT / 'member-community-home.png'))
        bob.save_screenshot(str(flow.OUT / 'member-community-home-mobile.png'))

        # The community's actual portal entry opens the board without a login wall.
        guest.get(flow.COMMUNITY.replace('/p/timebanking', '/p/'))
        flow.find(guest, '.tb-home')
        assert '/users/login' not in guest.current_url
        flow.find(guest, '.tb-signin')
        assert not guest.find_elements(By.CSS_SELECTOR, '.tb-mine')
        assert [tab.text for tab in guest.find_elements(By.CSS_SELECTOR, '.tb-tabs button')] == ['Home']
        for title in public:
            flow.find(guest, f'article[aria-label="{title}"]')
        for title in restricted:
            absent(guest, title)
        flow.open_listing(guest, public[0])
        assert 'Public' in flow.find(guest, '.tb-detail').text
        assert not guest.find_elements(By.XPATH, '//button[normalize-space(.)="Record completed help"]')
        close(guest)
        flow.check_layout(guest)
        guest.save_screenshot(str(flow.OUT / 'public-home-desktop.png'))
        guest.execute_cdp_cmd('Emulation.setDeviceMetricsOverride', {'width': 390, 'height': 844, 'deviceScaleFactor': 1, 'mobile': True})
        flow.check_layout(guest)
        guest.save_screenshot(str(flow.OUT / 'public-home-mobile.png'))

        # Changing publicity removes a listing and photo from unauthenticated reads.
        flow.open_listing(alice, public[0])
        Select(flow.find(alice, 'select[aria-label="Listing visibility"]')).select_by_value('members')
        flow.status(alice, 'Listing visibility updated.')
        close(alice)
        flow.button(guest, 'Refresh')
        WebDriverWait(guest, 10).until(lambda d: not d.find_elements(By.CSS_SELECTOR, f'article[aria-label="{public[0]}"]'))
        flow.open_listing(alice, restricted[0])
        Select(flow.find(alice, 'select[aria-label="Listing visibility"]')).select_by_value('public')
        flow.status(alice, 'Listing visibility updated.')
        close(alice)
        flow.button(guest, 'Refresh')
        flow.find(guest, f'article[aria-label="{restricted[0]}"] img')
        flow.open_listing(alice, public[0])
        Select(flow.find(alice, 'select[aria-label="Listing visibility"]')).select_by_value('public')
        flow.status(alice, 'Listing visibility updated.')
        close(alice)

        # Actions require sign-in and preserve the selected listing destination.
        guest.find_element(By.CSS_SELECTOR, f'article[aria-label="{public[1]}"] .tb-uptake button').click()
        flow.find(guest, '#email')
        assert 'next=%2Ftimebanking%3Flisting%3D' in guest.current_url
        flow.find(guest, '#email').send_keys('bob@example.test')
        flow.find(guest, '#pw').send_keys('timebank-test')
        flow.button(guest, 'Log In')
        assert public[1] in flow.find(guest, 'dialog[open]').text
        close(guest)
        flow.find(guest, f'article[aria-label="{restricted[1]}"]')
        flow.find(guest, '.tb-account-trigger').click()
        flow.button(guest, 'Sign out')
        flow.find(guest, '.tb-signin')
        flow.find(guest, '.tb-home')
        absent(guest, restricted[1])

        errors = [error for driver in [alice, bob, guest] for error in driver.execute_script('return window.__timebankErrors || []')]
        assert not errors, errors
        result = {'result': 'passed', 'checks': ['all authors on member and public home', 'public default for offers and requests', 'members-only listings and photos', 'visibility changes', 'community board after publishing and Home', 'guest desktop and mobile', 'sign-in preserves listing', 'logout removes restricted listings'], 'screenshots': str(flow.OUT)}
        (flow.OUT / 'public-result.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result, indent=2))
    except Exception:
        for name, driver in [('alice', alice), ('bob', bob), ('guest', guest)]:
            driver.save_screenshot(str(flow.OUT / f'public-failure-{name}.png'))
            (flow.OUT / f'public-failure-{name}.txt').write_text(driver.find_element(By.TAG_NAME, 'body').text)
        raise
    finally:
        for driver in [alice, bob, guest]:
            driver.quit()


if __name__ == '__main__':
    main()
