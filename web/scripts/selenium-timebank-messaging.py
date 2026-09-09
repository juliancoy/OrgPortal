"""Two-member acceptance using the real chat and timebank HTTP routes."""
import importlib.util
import json
import time
from pathlib import Path
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

spec = importlib.util.spec_from_file_location('flow', Path(__file__).with_name('selenium-timebank.py'))
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)
OUT = f.OUT / 'messaging'
OUT.mkdir(exist_ok=True)


def notifications(driver):
    driver.find_element(By.CSS_SELECTOR, '.tb-tabs button:nth-child(3)').click()
    f.find(driver, '.tb-notifications')
    f.button(driver, 'Refresh notifications')


def notice(driver, title):
    return WebDriverWait(driver, 15).until(lambda d: next((x for x in d.find_elements(By.CSS_SELECTOR, '[data-notification-id]') if title in x.text), False))


def message(driver, text):
    return WebDriverWait(driver, 25).until(lambda d: next((x for x in d.find_elements(By.CSS_SELECTOR, '.portal-chat-message') if text in x.text), False))


def home(driver):
    f.find(driver, '.tb-shell-brand').click()
    f.find(driver, '.tb-home')
    f.button(driver, 'Refresh')


def main():
    alice, bob = f.browser(), f.browser(390, 844)
    title = f'Neighbor garden help {int(time.time())}'
    try:
        f.login(alice, 'alice')
        f.post(alice, 'request', title, category='Home & garden')
        f.login(bob, 'bob')
        f.find(bob, f'article[aria-label="{title}"] a').click()
        draft = f.find(bob, 'textarea[aria-label="Message"]')
        WebDriverWait(bob, 15).until(lambda d: title in draft.get_attribute('value'))
        assert 'Hi Alice' in draft.get_attribute('value')
        listing_url = draft.get_attribute('value').splitlines()[-1]
        assert listing_url.startswith(f.COMMUNITY + '?listing=')
        assert not bob.find_elements(By.CSS_SELECTOR, '.portal-chat-message'), 'Draft sent without consent'
        draft.send_keys(' I can help Saturday at ten.')
        assert not bob.find_elements(By.CSS_SELECTOR, '.portal-chat-message'), 'Editing sent the draft'
        f.button(bob, 'Send')
        message(bob, 'I can help Saturday at ten.')
        assert draft.get_attribute('value') == ''
        f.check_layout(bob)
        bob.save_screenshot(str(OUT / 'mobile-chat.png'))
        # Leave the conversation so the reply remains unread.
        home(bob)
        f.button(alice, 'Refresh')
        WebDriverWait(alice, 15).until(lambda d: '1 unread' in d.find_element(By.CSS_SELECTOR, '.tb-messages-link').get_attribute('aria-label'))
        notifications(alice)
        unread_chat = f.find(alice, '.tb-notification-messages .tb-notice-open')
        assert 'Bob' in unread_chat.text
        alice.save_screenshot(str(OUT / 'desktop-unread-message.png'))
        unread_chat.click()
        message(alice, 'I can help Saturday at ten.')
        WebDriverWait(alice, 15).until(lambda d: d.find_element(By.CSS_SELECTOR, '.tb-messages-link').get_attribute('aria-label') == 'Messages')
        f.find(alice, 'textarea[aria-label="Message"]').send_keys('Saturday at ten works. Thank you!')
        f.button(alice, 'Send')
        message(alice, 'Saturday at ten works.')
        # Follow the actual message link, including a complete reload.
        f.find(alice, f'.portal-chat-message a[href="{listing_url}"]').click()
        assert title in f.find(alice, 'dialog[open]').text
        alice.refresh()
        assert title in f.find(alice, 'dialog[open]').text
        f.find(alice, 'button[aria-label="Close dialog"]').click()
        f.button(bob, 'Refresh')
        WebDriverWait(bob, 15).until(lambda d: '1 unread' in d.find_element(By.CSS_SELECTOR, '.tb-messages-link').get_attribute('aria-label'))
        row = f.find(bob, f'article[aria-label="{title}"]')
        row.find_element(By.XPATH, './/button[normalize-space(.)="Take up request"]').click()
        f.status(bob, 'You have taken up this request.')
        notifications(alice)
        uptake = notice(alice, 'Someone took up your request')
        assert title in uptake.text and 'Bob' in uptake.text
        uptake.find_element(By.CSS_SELECTOR, '.tb-notice-read').click()
        WebDriverWait(alice, 15).until(lambda d: not d.find_elements(By.CSS_SELECTOR, '[data-notification-id].is-unread'))
        alice.refresh()
        assert 'is-unread' not in notice(alice, 'Someone took up your request').get_attribute('class')
        notice(alice, 'Someone took up your request').find_element(By.CSS_SELECTOR, '.tb-notice-open').click()
        assert title in f.find(alice, 'dialog[open]').text
        f.find(alice, 'button[aria-label="Close dialog"]').click()
        f.record(bob, title, '0.5')
        notifications(alice)
        pending = notice(alice, 'Hours need your confirmation')
        pending.find_element(By.CSS_SELECTOR, '.tb-notice-open').click()
        f.find(alice, '.tb-activity')
        f.button(alice, 'Confirm hours')
        f.status(alice, 'Exchange confirmed.')
        f.balance(alice, '-0.5')
        notifications(bob)
        confirmed = notice(bob, 'Hours confirmed')
        assert title in confirmed.text
        assert 'Device alerts are not available yet.' in f.find(bob, '.tb-notification-device').text
        assert not bob.find_elements(By.XPATH, '//button[normalize-space(.)="Enable device alerts"]')
        for width in [390, 320]:
            bob.execute_cdp_cmd('Emulation.setDeviceMetricsOverride', {'width': width, 'height': 844, 'deviceScaleFactor': 1, 'mobile': True})
            f.check_layout(bob)
            WebDriverWait(bob, 5).until(lambda d: d.execute_script("const n=document.querySelector('.tb-tabs').getBoundingClientRect(),a=document.querySelector('.tb-tabs button[aria-current]').getBoundingClientRect();return a.left>=n.left-1&&a.right<=n.right+1"))
            bob.save_screenshot(str(OUT / f'mobile-{width}-notifications.png'))
        f.button(bob, 'Mark displayed activity read')
        WebDriverWait(bob, 15).until(lambda d: not d.find_elements(By.CSS_SELECTOR, '[data-notification-id].is-unread'))
        # A failed refresh retains the inbox and displays a retryable error.
        bob.execute_cdp_cmd('Network.enable', {})
        bob.execute_cdp_cmd('Network.setBlockedURLs', {'urls': ['*/api/timebank/notifications*']})
        f.button(bob, 'Refresh notifications')
        WebDriverWait(bob, 15).until(lambda d: 'Notifications could not be refreshed' in d.find_element(By.CSS_SELECTOR, '.tb-notifications').text)
        assert title in notice(bob, 'Hours confirmed').text
        bob.execute_cdp_cmd('Network.setBlockedURLs', {'urls': []})
        f.button(bob, 'Refresh notifications')
        WebDriverWait(bob, 15).until(lambda d: 'Notifications could not be refreshed' not in d.find_element(By.CSS_SELECTOR, '.tb-notifications').text)
        f.balance(bob, '0.5')
        f.login(alice, 'alice', f.CENTRAL)
        notifications(alice)
        assert not alice.find_elements(By.CSS_SELECTOR, '[data-notification-id]')
        errors = [error for driver in [alice, bob] for error in driver.execute_script('return window.__timebankErrors || []')]
        assert not errors, errors
        result = {'result': 'passed', 'checks': ['real member messaging with editable listing draft', 'unread message badges and read receipts', 'clickable persistent listing links', 'request uptake notifications and persistent read state', 'hour confirmation notifications and balances', 'community isolation', 'device alerts unavailable state', '390px and 320px notifications and chat', 'retryable refresh errors preserve activity'], 'screenshots': str(OUT)}
        (OUT / 'result.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result, indent=2))
    except Exception:
        for name, driver in [('alice', alice), ('bob', bob)]:
            driver.save_screenshot(str(OUT / f'failure-{name}.png'))
            (OUT / f'failure-{name}.txt').write_text(driver.find_element(By.TAG_NAME, 'body').text)
        raise
    finally:
        alice.quit()
        bob.quit()


if __name__ == '__main__':
    main()
