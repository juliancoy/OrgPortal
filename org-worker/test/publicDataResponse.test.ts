import test from 'node:test';
import assert from 'node:assert/strict';
import { publicDataResponse } from '../src/publicDataResponse';
test('public graph pages revalidate by content signature without a response body', async()=>{
 const url='https://lifetech.fyi/api/org/api/network/relationships/public?offset=0';
 const first=await publicDataResponse(new Request(url),{records:[{id:'a'}],nextRecordOffset:null});
 const etag=first.headers.get('ETag')!;
 const request=new Request(url,{headers:{'If-None-Match':etag}});
 const same=await publicDataResponse(request,{records:[{id:'a'}],nextRecordOffset:null});
 assert.equal(same.status,304);assert.equal(await same.text(),'');
 const changed=await publicDataResponse(request,{records:[{id:'b'}],nextRecordOffset:null});
 assert.equal(changed.status,200);assert.notEqual(changed.headers.get('ETag'),etag);
});
