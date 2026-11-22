import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

// Anonymous UI fixtures over the existing local Docker frontend. No data writes.
const base=process.env.CALENDAR_TEST_BASE||'https://localhost:8443';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname));
const output=process.env.CALENDAR_TEST_OUTPUT||'.test-output/tech-party-calendar';
await mkdir(output,{recursive:true});
const fixtures=Array.from({length:28},(_,i)=>({id:`fixture-${i}`,slug:`fixture-${i}`,title:i===0?'Tech Party community workshop':i===26?'Tech Party housing forum':`Political meeting ${i+1}`,description:'A public discussion about local policy.',starts_at:`2099-01-${String(i+1).padStart(2,'0')}T18:00:00Z`,location:'Baltimore, Maryland',community_event:i===0||i===26,organization_name:i===0?'Tech Party':'Local civic group'}));
const palette={primary:'#002a61','primary-bg':'#ffffdb','text-primary':'#002a61','text-secondary':'#002a61','text-muted':'#002a61',surface:'#ffffff',panel:'#ffffff','border-subtle':'#87ceeb'};
const site={id:'fixture-tech-party',hostname:'localhost',name:'Tech Party',slug:'tech-party',tagline:'Industry, education, work, and housing',accent_color:'#002a61',profile:'community',features:['directory','events','chat'],home_kind:'landing',home_org_slug:'tech-party',feature_config:{brandThemes:{defaultTheme:'tech-party',themes:[{id:'tech-party',name:'Tech Party',light:palette,dark:{...palette,primary:'#87ceeb','primary-bg':'#002a61','text-primary':'#ffffff','text-secondary':'#87ceeb','text-muted':'#87ceeb',surface:'#002a61',panel:'#002a61'}}]}}};
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true});
try {
 for(const width of [390,1280])for(const theme of ['light','dark']){
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:950},colorScheme:theme});
  await context.addInitScript(theme=>localStorage.setItem('orgportal.theme',theme),theme);
  let failNext=false;
  const requests=[];
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname))return route.abort();
   if(!['GET','HEAD','OPTIONS'].includes(route.request().method()))return route.abort();
   if(u.pathname==='/api/org/api/portal/site')return route.fulfill({json:site});
   if(u.pathname==='/api/org/api/network/events/recommended'){
    requests.push(u);
    if(failNext){failNext=false;return route.fulfill({status:503,body:'Fixture unavailable'});}
    const p=u.searchParams;
    let events=fixtures.filter(e=>(p.get('category')!=='community'||e.community_event)&&(!p.get('q')||e.title.toLowerCase().includes(p.get('q').toLowerCase()))&&(!p.get('from')||e.starts_at>=p.get('from'))&&(!p.get('to')||e.starts_at<p.get('to')));
    const offset=Number(p.get('offset'));
    return route.fulfill({json:events.slice(offset,offset+Number(p.get('limit')))});
   }
   return route.continue();
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/org-events');
  await page.getByRole('heading',{name:'Politics. People. Participation.'}).waitFor();
  await page.locator('.lte-card').first().waitFor();
  assert.equal(await page.locator('.lte-card').count(),25);
  assert.equal(await page.locator('.lte-card-tech-party').count(),1);
  failNext=true;
  await page.getByRole('button',{name:'More events',exact:true}).click();
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await page.locator('.lte-card').nth(27).waitFor();
  assert.equal(await page.locator('.lte-card-tech-party').count(),2);
  await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Agenda overflow ${width}`);
  assert.equal(await page.locator('.lte-card-tech-party').first().evaluate(e=>getComputedStyle(e).borderRadius),'0px');
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>parseFloat(getComputedStyle(e).borderTopLeftRadius)>0).map(e=>e.tagName+':'+e.className)),[]);
  await page.screenshot({path:`${output}/agenda-${width}-${theme}.png`,fullPage:true});
  await page.getByRole('button',{name:'Tech Party events',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.lte-card').length===2);
  assert.equal(await page.locator('.lte-card-tech-party').count(),2);
  await page.getByRole('button',{name:'Political events',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search events',exact:true}).fill('Housing');
  await page.waitForFunction(()=>document.querySelectorAll('.lte-card').length===1&&document.querySelector('.lte-card')?.textContent.includes('housing forum'));
  await page.getByRole('searchbox',{name:'Search events',exact:true}).fill('unmatched');
  await page.getByRole('heading',{name:'No events here just yet'}).waitFor();
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await page.locator('.lte-card').nth(24).waitFor();
  await page.goto(base+'/calendar?community=tech-party&view=calendar&month=2099-01');
  await page.locator('.lte-day a').first().waitFor();
  await page.getByRole('button',{name:'Load more events in this month'}).click();
  await page.locator('.lte-day a').nth(27).waitFor();
  assert.equal(await page.locator('.tech-party-event-label').count(),2);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Month overflow ${width}`);
  await page.screenshot({path:`${output}/month-${width}-${theme}.png`,fullPage:true});
  await page.getByRole('button',{name:'Next month',exact:true}).click();
  await page.getByRole('heading',{name:'No events here just yet'}).waitFor();
  await page.getByRole('button',{name:'Previous month',exact:true}).click();
  await page.locator('.lte-day a').first().waitFor();
  assert.ok(requests.every(u=>u.searchParams.get('community')==='tech-party'));
  assert.ok(requests.every(u=>u.searchParams.get('sort')==='date'));
  assert.deepEqual(errors,[]);
  await context.close();
  console.log(`Passed ${width}px ${theme}: tenant scope, paging/retry, all host highlights, search/reset, month navigation and no overflow.`);
 }
}finally{await browser.close();}
