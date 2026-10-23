import test from 'node:test';
import assert from 'node:assert/strict';
import { publicMediaObject } from '../src/publicMediaObject';
test('media handlers cannot read operational observatory objects even through a forged media reference',async()=>{
 let reads=0;const bucket={get:async()=>{reads++;return {body:'image'};}} as unknown as R2Bucket;
 assert.equal(await publicMediaObject(bucket,'private/website-observatory/runs/example.json'),null);
 assert.equal(reads,0);
 assert.ok(await publicMediaObject(bucket,'org-images/photo.png'));
 assert.equal(reads,1);
});
