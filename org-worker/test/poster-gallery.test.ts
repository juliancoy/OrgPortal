import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from '../src/index';
import { posterGallery, publicPosterImageUrl, driveLink } from '../src/posterGallery';
import { posterGalleryImage } from '../src/eventPoster';
import { EventTestDb } from './event-test-db';
import { TimebankBucket } from './helpers/timebankBucket';

async function fixture() {
  const db = new EventTestDb();
  await db.prepare("INSERT INTO group_sites (id,hostname,name,tagline,profile,public_base_url) VALUES ('portal','orgportal.cc','OrgPortal','','orgportal','https://orgportal.cc')").run();
  await db.prepare("ALTER TABLE events ADD COLUMN media_json TEXT DEFAULT '[]'").run();
  for (const [id, host] of [['current','org-one'], ['previous','org-one'], ['tagged','other'], ['unrelated','other'], ['future','org-one']]) {
    await db.prepare(`INSERT INTO events (id,ingest_key,title,slug,host_org_id,created_at,updated_at,media_json)
      VALUES (?,?,?,?,?,'2026-01-01','2026-01-01',?)`).bind(id,id,id,id,host,JSON.stringify([{id:'photo',kind:'image',image_key:`event-media/${id}/photo.png`,url:`/api/network/events/public/${id}/media/photo`}])).run();
  }
  await db.prepare("INSERT INTO organizations (id,name,slug,media_json) VALUES ('other','Other','other','[]')").run();
  await db.prepare("INSERT INTO organizations (id,name,slug,media_json) VALUES ('cohost','Cohost','cohost',?)").bind(JSON.stringify([{id:'photo',image_key:'organization-media/cohost/photo.png',url:'/api/network/orgs/public/cohost/media/photo'}])).run();
  await db.prepare("INSERT INTO event_organizations VALUES ('current','cohost')").run();
  await db.prepare("INSERT INTO event_organizations VALUES ('tagged','cohost')").run();
  await db.prepare("UPDATE organizations SET media_json=? WHERE id='org-one'").bind(JSON.stringify([
    {id:'photo',image_key:'organization-media/org-one/photo.png',url:'/api/network/orgs/public/one/media/photo'},
    {id:'linked',url:'https://images.example/art.png'},
    {id:'duplicate',url:'https://images.example/art.png'},
    {id:'private',url:'https://127.0.0.1/internal.png'},
  ])).run();
  await db.prepare("UPDATE events SET starts_at='2020-01-01T00:00:00Z', ends_at='2020-01-02T00:00:00Z'").run();
  await db.prepare("UPDATE events SET starts_at='2099-01-01T00:00:00Z', ends_at='2099-01-02T00:00:00Z' WHERE id='future'").run();
  return db;
}

test('poster catalog includes only the host organization and its past hosted events and saved public images, without unrelated images or duplicates', async t => {
  const db=await fixture();t.after(()=>db.close());
  const event=await db.prepare("SELECT * FROM events WHERE id='current'").first();
  const images=await posterGallery(db as unknown as D1Database,event);
  for(const id of ['event:current:photo','organization:org-one:photo','event:previous:photo','organization:org-one:$cover','organization:org-one:linked']) assert.ok(images.some(x=>x.id===id),id);
  assert.ok(!images.some(x=>['unrelated','tagged','cohost','future'].some(id=>x.id.includes(id))||x.id.endsWith(':duplicate')||x.id.endsWith(':private')));
  const response=await app.request('https://orgportal.cc/api/network/events/public/current/poster-images',{}, {DB:db} as unknown as Env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.ok(!(await response.text()).includes('image_key'));
  await db.prepare("DELETE FROM event_organizations WHERE event_id='current'").run();
  assert.deepEqual((await posterGallery(db as unknown as D1Database,{...event,host_org_id:null})).map(x=>x.id), ['event:current:photo']);
});

test('flyers embed organization and related-event uploads and reject unrelated or detached selections', async t => {
  const db=await fixture();t.after(()=>db.close());
  const bucket=new TimebankBucket();
  for(const key of ['organization-media/org-one/photo.png','event-media/previous/photo.png']) await bucket.put(key,new Uint8Array([1,2,3]),{httpMetadata:{contentType:'image/png'}});
  const env={DB:db,SCAN_IMAGES:bucket.asR2()} as unknown as Env;
  const flyer=(id:string)=>app.request(`https://orgportal.cc/api/network/events/public/current/flyer.svg?background=gallery&mediaId=${encodeURIComponent(id)}`,{},env);
  for(const id of ['organization:org-one:photo','event:previous:photo']) {
    const response=await flyer(id);assert.equal(response.status,200);assert.match(await response.text(),/data:image\/png;base64,AQID/);
  }
  t.mock.method(globalThis,'fetch',async () => new Response(new Uint8Array([4,5,6]), {headers:{'content-type':'image/png'}}));
  const linked = await flyer('organization:org-one:linked');
  assert.equal(linked.status,200);
  assert.match(await linked.text(), /data:image\/png;base64,BAUG/);
  assert.equal(linked.headers.get('cache-control'),'no-store');
  assert.equal((await flyer('event:unrelated:photo')).status,404);
  await db.prepare("DELETE FROM event_organizations WHERE event_id='current' AND organization_id='cohost'").run();
  assert.equal((await flyer('organization:cohost:photo')).status,404);
});

test('linked images are fetched without credentials, never follow redirects, and reject unsafe or oversized content', async t => {
  for(const value of ['http://images.example/a.png','https://localhost/a','https://localhost./a','https://127.0.0.1/a','https://[::1]/a','https://user:password@images.example/a','https://images.example:8443/a']) assert.equal(publicPosterImageUrl(value),undefined);
  let response=new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});
  t.mock.method(globalThis,'fetch',async (_url,options)=>{assert.equal(options.redirect,'manual');assert.equal(options.headers,undefined);return response;});
  assert.equal(await posterGalleryImage('https://images.example/art.png'),'data:image/png;base64,AQID');
  for(const invalid of [new Response(null,{status:302}),new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}}),new Response(new Uint8Array(8*1024*1024+1),{headers:{'content-type':'image/png'}})]) {
    response=invalid;assert.equal(await posterGalleryImage('https://images.example/art.png'),undefined);
  }
});

test('Drive files and past-event photo folders are included, but calendar-only folders are not fetched', async t => {
  const db=await fixture();t.after(()=>db.close());
  await db.prepare("UPDATE events SET event_links_json=? WHERE id='previous'").bind(JSON.stringify([{id:'album',url:'https://drive.google.com/drive/folders/folder123456789'}])).run();
  await db.prepare("UPDATE events SET event_links_json=? WHERE id='tagged'").bind(JSON.stringify([{id:'wrong',url:'https://drive.google.com/drive/folders/unrelated123456'}])).run();
  await db.prepare("UPDATE organizations SET media_json=? WHERE id='org-one'").bind(JSON.stringify([{id:'drive-file',kind:'image',url:'https://drive.google.com/file/d/photo123456789/view'}])).run();
  const calls:string[]=[];
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    calls.push(String(url)); assert.equal(options.redirect,'manual'); assert.equal(options.headers,undefined);
    return new Response('<div class="flip-entry" id="entry-folderphoto123"><div class="flip-entry-thumb"><img src="https://lh3.googleusercontent.com/drive-storage/photo=s190"></div><img src="https://drive-thirdparty.googleusercontent.com/16/type/image/jpeg"><div class="flip-entry-title">Past event.jpg</div></div>');
  });
  const event=await db.prepare("SELECT * FROM events WHERE id='current'").first();
  const images=await posterGallery(db as unknown as D1Database,event);
  assert.ok(images.some(x=>x.id==='organization:org-one:drive-file' && x.url==='https://lh3.googleusercontent.com/d/photo123456789=w1600'));
  assert.ok(images.some(x=>x.id==='event:previous:drive:folderphoto123' && x.url.endsWith('=w1600')));
  assert.deepEqual(calls,['https://drive.google.com/embeddedfolderview?id=folder123456789']);
  assert.equal(driveLink('https://evil.example/file/d/photo123456789/view'),undefined);
  assert.deepEqual(driveLink('https://drive.google.com/open?id=photo123456789'),{kind:'file',id:'photo123456789'});
});
