import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { driveCarouselRoutes, parsePublicDriveFolder, MEDTECH_CAROUSEL } from '../src/driveCarousel';
import { TimebankDatabase } from './helpers/timebankDatabase';
const fixtureHtml = (id: string, name: string, mime: string, host = 'lh3.googleusercontent.com') => `<div class="flip-entry" id="entry-${id}"><div class="flip-entry-thumb"><img src="https://${host}/drive-storage/image=s190" /></div><img src="https://drive-thirdparty.googleusercontent.com/16/type/${mime}"><div class="flip-entry-title">${name}</div></div>`;
const html = fixtureHtml('image123456789', 'Photo &amp; friends.HEIC', 'image/heif') + fixtureHtml('video123456789', 'Video.mp4', 'video/mp4') + fixtureHtml('image987654321','Second.jpg','image/jpeg');
test('public folder parser includes images and HEIC previews, excludes videos and unsafe thumbnail hosts', () => {
 const folder = parsePublicDriveFolder(html + fixtureHtml('image555555555','Other.jpg','image/jpeg','evil.example'));
 assert.equal(folder.images.length,2); assert.equal(folder.images[0].name,'Photo & friends.HEIC'); assert.ok(folder.images[0].imageUrl.endsWith('=w1600'));
 assert.throws(()=>parsePublicDriveFolder('<html>Sign in</html>'),/photo folder/);
});
test('hide and restore persist only for the authenticated account and tenant, without changing the public folder', async () => {
 const db = new TimebankDatabase();
 db.sqlite.exec(readFileSync(new URL('../migrations/0048_user_hidden_carousel_images.sql',import.meta.url),'utf8'));
 db.sqlite.exec("INSERT INTO portal_tenants (id,hostname,name,tagline) VALUES ('lifetech','lifetech.fyi','LifeTech','Health')");
 const auth = async (_env: Env, req: Request) => { const id=req.headers.get('authorization'); if(!id)throw new HTTPException(401);return {id}; };
 const app=new Hono<{Bindings:Env}>();app.route('/carousel',driveCarouselRoutes(auth,async()=>parsePublicDriveFolder(html)));
 const request=(path:string,method='GET',user='',host='medtech.social',body?:unknown)=>app.fetch(new Request(`https://${host}/carousel/${MEDTECH_CAROUSEL.id}${path}`,{method,headers:{...(user?{authorization:user}:{}),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),{DB:db.asD1()} as Env);
 const state=async(user:string)=>(await (await request('/me','GET',user)).json() as {hiddenImageIds:string[]}).hiddenImageIds;
 try{
  assert.equal((await request('')).status,200); assert.equal((await request('/me')).status,401);assert.equal((await request('/me/hidden/image123456789','PUT')).status,401);
  assert.equal((await request('/me/hidden/image123456789','PUT','alice','medtech.social',{user_id:'bob'})).status,200);
  assert.deepEqual(await state('alice'),['image123456789']); assert.deepEqual(await state('bob'),[]);
  assert.equal((await request('/me/hidden/image123456789','PUT','alice')).status,200);assert.deepEqual(await state('alice'),['image123456789']);
  assert.equal((await request('/me/hidden/not-in-folder','PUT','alice')).status,404);
  assert.equal((await request('/me','GET','alice','codecollective.us')).status,404);
  assert.equal((await request('', 'GET', '', 'lifetech.fyi')).status,200);
  const lifeState=async()=>(await (await request('/me','GET','alice','lifetech.fyi')).json() as {hiddenImageIds:string[]}).hiddenImageIds;
  assert.deepEqual(await lifeState(),[]);
  assert.equal((await request('/me/hidden/image987654321','PUT','alice','lifetech.fyi')).status,200);
  assert.deepEqual(await lifeState(),['image987654321']);
  assert.deepEqual(await state('alice'),['image123456789']);
  assert.equal((await request('/me/hidden/image987654321','DELETE','alice','lifetech.fyi')).status,200);
  assert.deepEqual(await lifeState(),[]);
  assert.deepEqual(await state('alice'),['image123456789']);
  assert.equal((await request('/me/hidden/image123456789','DELETE','bob')).status,200);assert.deepEqual(await state('alice'),['image123456789']);
  const publicFolder=await (await request('')).json() as {images:unknown[]};assert.equal(publicFolder.images.length,2);assert.ok(!JSON.stringify(publicFolder).includes('alice'));
  const privateResponse=await request('/me','GET','alice');assert.ok(privateResponse.headers.get('cache-control')?.includes('no-store'));
  assert.equal((await request('/me/hidden/image123456789','DELETE','alice')).status,200); assert.deepEqual(await state('alice'),[]);
 } finally{db.sqlite.close()}
});
