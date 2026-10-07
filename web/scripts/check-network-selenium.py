"""Read-only graph checks using the existing Selenium Chrome service."""
import json, os, time
from selenium import webdriver
from selenium.webdriver.support.ui import WebDriverWait
options=webdriver.ChromeOptions()
options.add_argument('--headless=new')
options.add_argument('--no-sandbox')
options.add_argument('--disable-dev-shm-usage')
options.add_argument('--window-size=1440,900')
options.set_capability('goog:loggingPrefs',{'browser':'ALL'})
origin=os.environ.get('MAP_ORIGIN','https://lifetech.fyi')
for mode in ('svg','webgl'):
 driver=webdriver.Remote(os.environ.get('SELENIUM_URL','http://127.0.0.1:4445/wd/hub'),options=options)
 try:
  driver.execute_cdp_cmd('Network.enable',{})
  driver.execute_cdp_cmd('Network.setBlockedURLs',{'urls':['*/api/org/api/network/*']})
  if mode=='svg':
   driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument',{'source':"const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...a){return k.includes('webgl')?null:old.call(this,k,...a)}"})
  driver.get(origin+'/ecosystem/network')
  wait=WebDriverWait(driver,60)
  wait.until(lambda d:d.execute_script("return !!document.querySelector('#proximity') && document.querySelector('#network-status').textContent.includes('visible links')"))
  driver.execute_script("const e=document.querySelector('#proximity');e.value='2';e.dispatchEvent(new Event('input'))")
  assert driver.execute_script("return document.querySelector('#proximity-value').textContent")=='2.0'
  position="return JSON.stringify([...document.querySelectorAll('#network-labels button')].map(e=>e.style.cssText))"
  before=driver.execute_script(position);time.sleep(.4)
  assert before!=driver.execute_script(position),'nodes should move'
  if mode=='svg':
   updates=driver.execute_async_script("const done=arguments[0];let frames=0;const observer=new MutationObserver(()=>frames++);observer.observe(document.querySelector('[data-node-id]'),{attributes:true,attributeFilter:['transform']});setTimeout(()=>{observer.disconnect();done(frames)},1000)")
   assert 0<updates<=35,f'bounded geometry updates: {updates}'
   print('SVG geometry updates per second:',updates)
  driver.execute_script("const e=document.querySelector('#live-physics');e.checked=false;e.dispatchEvent(new Event('change'))")
  time.sleep(.1);before=driver.execute_script(position);time.sleep(.3)
  assert before==driver.execute_script(position),'paused graph should remain still'
  print(mode,'source proximity, movement and pause verified using Selenium')
 except Exception:
  print(json.dumps({'url':driver.current_url,'browserErrors':driver.get_log('browser')[-5:]}))
  raise
 finally:
  driver.quit()
