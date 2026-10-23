import test from 'node:test';
import assert from 'node:assert/strict';
import { EventTestDb } from './event-test-db';
import { organizationPosterEvents, organizationPosterPages } from '../src/organizationPoster';
import { renderEventPoster } from '../src/eventPoster';
import { posterGallery } from '../src/posterGallery';

test('org posters include all and only upcoming hosted events, with scoped artwork', async () => {
  const db = new EventTestDb();
  try {
    for (let i=0;i<205;i++) await db.prepare(`INSERT INTO events(id,ingest_key,slug,title,host_org_id,starts_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(`e${i}`,`e${i}`,`e${i}`,`Hosted ${i}`, 'org-one','2099-12-01T18:00:00Z','2026-01-01','2026-01-01').run();
    for (const [id,org,date] of [['past','org-one','2000-01-01'],['other','other-org','2099-01-01']]) await db.prepare(`INSERT INTO events(id,ingest_key,slug,title,host_org_id,event_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).bind(id,id,id,id,org,date,'2026-01-01','2026-01-01').run();
    const events=await organizationPosterEvents(db as unknown as D1Database,'org-one');
    assert.equal(events.length,205);assert.ok(events.every(event=>event.title.startsWith('Hosted')));
    const gallery=await posterGallery(db as unknown as D1Database,{id:'org-one',slug:'one',name:'One',image_url:'https://one.example/logo.png'},true);
    assert.equal(gallery.length,1);assert.equal(gallery[0].id,'organization:org-one:$cover');assert.match(gallery[0].source,/Organization: One/);
  } finally { db.close(); }
});

test('all formats paginate complete text without dropping long entries',async()=>{
  const events=Array.from({length:17},(_,i)=>({title:`Event${i} `+'Accomplished community builders '.repeat(i===3?30:1),starts_at:'2099-12-01T18:00:00Z',location:`Venue${i}`}));
  for (const format of ['letter','letter-4up','postcard','social'] as const) {
    const pages=organizationPosterPages(events,format);assert.ok(pages.length>1);
    const text=pages.flat().join(' ');
    for(let i=0;i<17;i++){assert.ok(text.includes(`Event${i}`));assert.ok(text.includes(`Venue${i}`));}
    assert.equal(text.match(/Accomplished/g)?.length,46);
    for(let page=0;page<pages.length;page++){
      const svg=await renderEventPoster({title:'What’s coming up'},'https://portal.example/orgs/one',format,{name:'One'},'light',{organization:true,agenda:{lines:pages[page],page:page+1,pages:pages.length}});
      assert.ok(svg.includes('Scan to connect'));assert.ok(!svg.includes('Scan to RSVP'));assert.ok(!svg.includes('Date to be announced'));
    }
  }
  assert.match(organizationPosterPages([],'letter')[0][0],/No upcoming/);
  const svg=await renderEventPoster({title:'<script>Org</script>',description:'Build & collaborate',location:'Baltimore'},'https://portal.example/orgs/one','letter',{name:'One'},'light',{organization:true});
  assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('Build &amp; collaborate'));assert.ok(!svg.includes('Date to be announced'));
});

test('public org poster endpoints isolate gallery selection and report every page', async () => {
  const {app}=await import('../src/index');
  const {TimebankBucket}=await import('./helpers/timebankBucket');
  const db=new EventTestDb();
  try {
    await db.prepare("ALTER TABLE organizations ADD COLUMN city TEXT").run();
    await db.prepare("UPDATE organizations SET media_json=? WHERE id='org-one'").bind(JSON.stringify([{id:'photo',kind:'image',image_key:'organization-media/org-one/photo.png',url:'/api/network/orgs/public/one/media/photo'}])).run();
    await db.prepare("INSERT INTO organizations(id,name,slug) VALUES('other','Other','other')").run();
    const bucket = new TimebankBucket();
    await bucket.put('organization-media/org-one/photo.png',new Uint8Array([1,2,3]),{httpMetadata:{contentType:'image/png'}});
    const env={DB:db,SCAN_IMAGES:bucket,PUBLIC_PORTAL_BASE_URL:'https://portal.example/p'} as unknown as Env;
    const root='https://portal.example/api/network/orgs/public/one';
    const gallery=await app.request(root+'/poster-images',{},env);
    assert.equal(gallery.status,200);assert.ok(!(await gallery.text()).includes('image_key'));
    const response=await app.request(root+'/flyer.svg?includeEvents=true&page=999',{},env);
    assert.equal(response.status,200);assert.equal(response.headers.get('x-poster-pages'),'1');assert.equal(response.headers.get('x-poster-page'),'1');assert.equal(response.headers.get('x-poster-events'),'0');
    assert.equal(response.headers.get('cache-control'),'no-store');assert.match(await response.text(),/No upcoming hosted/);
    const image=await app.request(root+'/flyer.svg?background=gallery&mediaId=organization%3Aorg-one%3Aphoto',{},env);
    assert.equal(image.status,200);assert.match(await image.text(),/data:image\/png;base64,AQID/);
    assert.equal((await app.request(root+'/flyer.svg?background=gallery&mediaId=organization:other:photo',{},env)).status,404);
    assert.equal((await app.request('https://portal.example/api/network/orgs/public/missing/flyer.svg',{},env)).status,404);
  } finally {db.close();}
});
