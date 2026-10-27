import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { hasMembershipRequest, membershipRequests, requestMembership, removeMembershipRequest } from '../src/membershipRequests';

test('unmigrated deployments preserve membership reads and refuse request writes clearly', async () => {
  const sql=new DatabaseSync(':memory:');
  const db={prepare(query:string){const statement=sql.prepare(query);return {bind(){return this},first:async()=>statement.get()}}} as unknown as D1Database;
  try {
    assert.equal(await hasMembershipRequest(db,'org','person'),false);
    assert.deepEqual(await membershipRequests(db,'org'),[]);
    await removeMembershipRequest(db,'org','person');
    await assert.rejects(requestMembership(db,'org','person','Person'),{status:503});
  } finally {sql.close();}
});
