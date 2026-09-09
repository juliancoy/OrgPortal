"""Account menu and accessibility acceptance; run with the timebank fixture server.
Set TIMEBANK_TEST_AVATAR_PATH on the server to a local JPEG for the photo check.
"""
import importlib.util
import json
from pathlib import Path
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait, Select

spec = importlib.util.spec_from_file_location('timebank', Path(__file__).with_name('selenium-timebank.py'))
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)
OUT = f.OUT / 'account'
OUT.mkdir(exist_ok=True)

def closed(driver):
    WebDriverWait(driver, 5).until(lambda d: not d.find_elements(By.CSS_SELECTOR, '.tb-account-panel'))
    assert f.find(driver, '.tb-account-trigger').get_attribute('aria-expanded') == 'false'

def open_menu(driver):
    trigger = f.find(driver, '.tb-account-trigger')
    trigger.click()
    f.find(driver, '.tb-account-panel')
    assert trigger.get_attribute('aria-expanded') == 'true'
    return trigger

def targets(driver):
    for item in driver.find_elements(By.CSS_SELECTOR, '.tb-account-trigger,.tb-add,.tb-column-meta select,.tb-uptake button,.tb-account-panel a,.tb-account-panel button'):
        assert item.rect['height'] >= 44, (item.text, item.rect)
    f.check_layout(driver)

def main():
    alice, bob = f.browser(), f.browser(390,844)
    try:
        f.login(alice, 'alice')
        photo = f.find(alice, '.tb-account-trigger img')
        WebDriverWait(alice, 10).until(lambda d: photo.get_property('naturalWidth') > 0)
        assert photo.rect['width'] == photo.rect['height']
        trigger = open_menu(alice)
        assert 'Alice' in f.find(alice, '.tb-account-identity').text
        assert 'alice@example.test' in f.find(alice, '.tb-account-identity').text
        links = alice.find_elements(By.CSS_SELECTOR, '.tb-account-panel nav a')
        assert links[0].get_attribute('href').endswith('/p/profile')
        assert links[1].get_attribute('href').endswith('/p/settings')
        targets(alice)
        alice.save_screenshot(str(OUT/'desktop-account.png'))
        trigger.send_keys(Keys.ESCAPE); closed(alice)
        assert alice.switch_to.active_element == trigger
        trigger.send_keys(Keys.ENTER)
        f.find(alice,'.tb-account-panel')
        trigger.send_keys(Keys.TAB)
        assert alice.switch_to.active_element.text == 'Profile & photo'
        alice.switch_to.active_element.send_keys(Keys.TAB)
        assert alice.switch_to.active_element.text == 'Account settings'
        alice.switch_to.active_element.send_keys(Keys.TAB)
        assert alice.switch_to.active_element.text == 'Sign out'
        alice.switch_to.active_element.send_keys(Keys.TAB)
        closed(alice)
        open_menu(alice); f.find(alice,'.tb-search input').click(); closed(alice)
        # Route changes close the disclosure and keep a direct way home.
        open_menu(alice)
        alice.find_element(By.CSS_SELECTOR,'.tb-account-panel a[href$="/settings"]').click()
        WebDriverWait(alice,10).until(lambda d:d.current_url.endswith('/settings'))
        closed(alice)
        assert f.find(alice,'h1').text == 'Settings'
        Select(f.find(alice,'select[aria-label="Select color theme"]')).select_by_value('dark')
        f.find(alice,'.tb-shell-brand').click();f.find(alice,'.tb-home')
        open_menu(alice)
        alice.save_screenshot(str(OUT/'dark-account.png'))
        f.find(alice,'.tb-account-trigger').send_keys(Keys.ESCAPE)
        # A missing or failed photo falls back to initials, never a broken image.
        alice.execute_cdp_cmd('Network.enable',{})
        alice.execute_cdp_cmd('Network.setCacheDisabled',{'cacheDisabled':True})
        alice.execute_cdp_cmd('Network.setBlockedURLs',{'urls':['*timebank-test-avatar*']})
        alice.refresh();f.find(alice,'.tb-home')
        WebDriverWait(alice,10).until(lambda d:not d.find_elements(By.CSS_SELECTOR,'.tb-account-trigger img'))
        assert f.find(alice,'.tb-account-trigger .tb-account-avatar').text == 'A'
        f.login(bob,'bob')
        assert not bob.find_elements(By.CSS_SELECTOR,'.tb-account-trigger img')
        assert f.find(bob,'.tb-account-trigger .tb-account-avatar').text == 'B'
        for width in [390,320]:
            bob.execute_cdp_cmd('Emulation.setDeviceMetricsOverride',{'width':width,'height':844,'deviceScaleFactor':1,'mobile':True})
            targets(bob)
            trigger=open_menu(bob);targets(bob)
            panel=f.find(bob,'.tb-account-panel')
            assert panel.rect['x'] >= 0 and panel.rect['x']+panel.rect['width'] <= width
            bob.save_screenshot(str(OUT/f'mobile-{width}-account.png'))
            trigger.send_keys(Keys.ESCAPE)
        search=f.find(bob,'.tb-search input');search.send_keys('unmatched timebank search')
        WebDriverWait(bob,5).until(lambda d:len(d.find_elements(By.CSS_SELECTOR,'.tb-empty'))==2)
        f.find(bob,'button[aria-label="Clear search"]').click()
        assert search.get_attribute('value') == ''
        assert bob.switch_to.active_element == search
        # The visible menu action ends the session and returns to sign-in.
        open_menu(bob);f.button(bob,'Sign out');f.find(bob,'#email')
        assert not bob.find_elements(By.CSS_SELECTOR,'.tb-account-trigger')
        errors=[e for d in [alice,bob] for e in d.execute_script('return window.__timebankErrors || []')]
        assert not errors,errors
        result={'result':'passed','checks':['profile image from session','missing and failed image initials','profile/settings links','keyboard Tab Enter Escape and focus restoration','outside click and focus dismissal','settings route and dark appearance','44px touch targets','390px and 320px mobile menus','clear search and focus','sign out'],'screenshots':str(OUT)}
        (OUT/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
    except Exception:
        for name,d in [('alice',alice),('bob',bob)]:
            d.save_screenshot(str(OUT/f'failure-{name}.png'))
            (OUT/f'failure-{name}.txt').write_text(d.find_element(By.TAG_NAME,'body').text)
        raise
    finally:
        alice.quit();bob.quit()

if __name__ == '__main__': main()
