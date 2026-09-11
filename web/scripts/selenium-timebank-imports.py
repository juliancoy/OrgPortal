"""Claim/import acceptance with synthetic members; start TIMEBANK_TEST_IMPORTS=1."""
import importlib.util,json
from pathlib import Path
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
spec=importlib.util.spec_from_file_location('flow',Path(__file__).with_name('selenium-timebank.py'))
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
f.COMMUNITY='http://bmoretimebank.codecollective.us:5179/'
f.CENTRAL='http://codecollective.us:5179/p/timebanking'
OUT=f.OUT/'imports';OUT.mkdir(exist_ok=True)

def login(d,name):
 d.get(f.COMMUNITY+'users/login?next=%2F')
 f.find(d,'#email').send_keys(name+'@example.test');f.find(d,'#pw').send_keys('timebank-test');f.button(d,'Log In');f.find(d,'.tb-home')

def request(d):
 f.button(d,'Claim LetsBMore account')
 field=f.find(d,'#tb-import-search');field.clear();field.send_keys('Former Member')
 f.find(d,'button[aria-label="Claim Former Member"]').click()
 f.find(d,'.tb-claim-form textarea').send_keys('A coordinator can verify my former membership.')
 f.button(d,'Submit claim');WebDriverWait(d,15).until(lambda b:'Claim pending: Former Member' in b.find_element(By.TAG_NAME,'body').text)

def main():
 alice,bob=f.browser(),f.browser(390,844)
 try:
  bob.get(f.COMMUNITY);f.find(bob,'.tb-home')
  assert not bob.find_elements(By.CSS_SELECTOR,'[data-imported-id]')
  login(bob,'bob');WebDriverWait(bob,15).until(lambda d:len(d.find_elements(By.CSS_SELECTOR,'[data-imported-id]'))==2)
  assert 'Ended source listing' not in bob.find_element(By.TAG_NAME,'body').text
  f.find(bob,'.tb-imported-listing summary').click();assert 'Garden together' in f.find(bob,'.tb-imported-detail').text
  f.check_layout(bob);bob.save_screenshot(str(OUT/'mobile-imported-board.png'))
  request(bob);f.button(bob,'Withdraw claim');WebDriverWait(bob,15).until(lambda d:d.find_elements(By.ID,'tb-import-search'))
  request(bob);bob.save_screenshot(str(OUT/'claim-pending.png'))
  login(alice,'alice');f.button(alice,'Admin');f.find(alice,'.tb-claim-review')
  assert '0 of 3 accounts claimed' in alice.find_element(By.TAG_NAME,'body').text
  f.find(alice,'.tb-claim-review textarea').send_keys('Verified with the former coordinator in this test.')
  f.button(alice,'Approve claim');WebDriverWait(alice,15).until(lambda d:'Claim approved.' in d.find_element(By.TAG_NAME,'body').text)
  f.button(bob,'Refresh claims');WebDriverWait(bob,15).until(lambda d:'Opening balance: 37 h' in d.find_element(By.TAG_NAME,'body').text)
  assert 'Historical transactions (1)' in bob.find_element(By.TAG_NAME,'body').text
  assert 'Imported listings (2)' in bob.find_element(By.TAG_NAME,'body').text
  for width in [390,320]:
   bob.execute_cdp_cmd('Emulation.setDeviceMetricsOverride',{'width':width,'height':844,'deviceScaleFactor':1,'mobile':True});f.check_layout(bob);bob.save_screenshot(str(OUT/f'claimed-{width}.png'))
  f.button(bob,'My hours');WebDriverWait(bob,15).until(lambda d:d.find_element(By.CSS_SELECTOR,'[data-testid="hours-balance"]').text=='37 h')
  bob.refresh();WebDriverWait(bob,15).until(lambda d:d.find_element(By.CSS_SELECTOR,'[data-testid="hours-balance"]').text=='37 h')
  f.find(alice,'.tb-shell-brand').click();f.find(alice,'.tb-home')
  alice.get(f.CENTRAL);f.find(alice,'.tb-home');assert not alice.find_elements(By.CSS_SELECTOR,'[data-imported-id]')
  assert not alice.find_elements(By.XPATH,'//button[normalize-space(.)="Claim LetsBMore account"]')
  f.find(bob,'.tb-account-trigger').click();f.button(bob,'Sign out');WebDriverWait(bob,15).until(lambda d:not d.find_elements(By.CSS_SELECTOR,'.tb-account-trigger'))
  bob.get(f.COMMUNITY);f.find(bob,'.tb-home');assert not bob.find_elements(By.CSS_SELECTOR,'[data-imported-id]')
  errors=[e for d in [alice,bob] for e in d.execute_script('return window.__timebankErrors || []')];assert not errors,errors
  result={'result':'passed','checks':['member-only archived board','source description','claim search and submission','withdraw and resubmit','administrator review','private history after approval','opening balance applied exactly once','320px and 390px layouts','community isolation','logout clears private catalog'],'screenshots':str(OUT)}
  (OUT/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
 except Exception:
  for name,d in [('alice',alice),('bob',bob)]:d.save_screenshot(str(OUT/f'failure-{name}.png'));(OUT/f'failure-{name}.txt').write_text(d.find_element(By.TAG_NAME,'body').text)
  raise
 finally:alice.quit();bob.quit()
if __name__=='__main__':main()
