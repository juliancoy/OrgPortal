import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from '../src/index';
import { posterGallery, publicPosterImageUrl } from '../src/posterGallery';
import { posterGalleryImage } from '../src/eventPoster';
import { EventTestDb } from './event-test-db';
import { TimebankBucket } from './helpers/timebankBucket';

async function fixture() {
  const db = new EventTestDb();
  await db.prepare("INSERT INTO group_sites (id,hostname,name,tagline,profile,public_base_url) VALUES ('portal','orgportal.cc','OrgPortal','','orgportal','https://orgportal.cc')").run();
  await db.prepare("ALTER TABLE events ADD COLUMN media_json TEXT DEFAULT '[]'").run();
  for (const [id, host] of [['current','org-one'], ['previous','org-one'], ['tagged','other'], ['unrelated','other']]) {
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
  return db;
}

test('poster catalog includes attached organizations, their associated events and saved public images, without unrelated images or duplicates', async t => {
  const db=await fixture();t.after(()=>db.close());
  const event=await db.prepare("SELECT * FROM events WHERE id='current'").first();
  const images=await posterGallery(db as unknown as D1Database,event);
  for(const id of ['event:current:photo','organization:org-one:photo','organization:cohost:photo','event:previous:photo','event:tagged:photo','organization:org-one:$cover','organization:org-one:linked']) assert.ok(images.some(x=>x.id===id),id);
  assert.ok(!images.some(x=>x.id.includes('unrelated')||x.id.endsWith(':duplicate')||x.id.endsWith(':private')));
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
  for(const key of ['organization-media/cohost/photo.png','event-media/previous/photo.png']) await bucket.put(key,new Uint8Array([1,2,3]),{httpMetadata:{contentType:'image/png'}});
  const env={DB:db,SCAN_IMAGES:bucket.asR2()} as unknown as Env;
  const flyer=(id:string)=>app.request(`https://orgportal.cc/api/network/events/public/current/flyer.svg?background=gallery&mediaId=${encodeURIComponent(id)}`,{},env);
  for(const id of ['organization:cohost:photo','event:previous:photo']) {
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
