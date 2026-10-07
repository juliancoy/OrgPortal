import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { TimebankDatabase } from './helpers/timebankDatabase';
import { provisionOrganizationChat, provisionPendingOrganizationChats } from '../src/organizationChat';
import { ensureOrganizationRoom } from '../../chat-worker/src/organizationRooms';

test('claimed organizations provision one room, with durable retry and rename reconciliation', async () => {
  const org = new TimebankDatabase();
  const chat = new TimebankDatabase();
  try {
    for (const file of ['0002_org_event_directories.sql', '0015_organization_iam.sql']) {
      org.sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    }
    org.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('existing','Existing','existing')");
    org.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('unclaimed','Imported Group','unclaimed')");
    org.sqlite.exec(readFileSync(new URL('../migrations/0062_organization_chat.sql', import.meta.url), 'utf8'));
    chat.sqlite.exec(readFileSync(new URL('../../chat-worker/migrations/0001_chat.sql', import.meta.url), 'utf8'));
    org.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('lifetech','LifeTech','lifetech')");
    org.sqlite.exec("INSERT INTO organization_memberships(organization_id,user_id,role) VALUES('lifetech','alice','owner')");
    org.sqlite.exec("INSERT INTO organization_ownerships(id,organization_id,owner_user_id,status,started_at) VALUES('own-life','lifetech','alice','active','2026-10-06'),('own-existing','existing','alice','active','2026-10-06')");
    assert.equal(org.sqlite.prepare('SELECT count(*) n FROM organization_chat_provisioning').get()!.n, 3);
    let unavailable = true;
    const env = {
      DB: org.asD1(),
      CHAT_ORGANIZATION_ROOMS: { async ensure(id: string) {
        if (unavailable) throw new Error('Chat temporarily unavailable');
        return ensureOrganizationRoom({ DB: chat.asD1(), CONTACTS_DB: org.asD1() }, id);
      } },
    } as Env;
    assert.equal(await provisionOrganizationChat(env, 'unclaimed'), false);
    assert.equal(org.sqlite.prepare("SELECT attempts FROM organization_chat_provisioning WHERE organization_id='unclaimed'").get()!.attempts, 0);
    assert.equal(await provisionOrganizationChat(env, 'lifetech'), false);
    assert.equal(org.sqlite.prepare("SELECT completed_at FROM organization_chat_provisioning WHERE organization_id='lifetech'").get()!.completed_at, null);
    unavailable = false;
    await provisionPendingOrganizationChats(env);
    assert.equal(chat.sqlite.prepare('SELECT count(*) n FROM chat_conversations').get()!.n, 2);
    assert.equal(org.sqlite.prepare('SELECT count(*) n FROM organization_chat_provisioning WHERE completed_at IS NULL').get()!.n, 1);
    await assert.rejects(() => env.CHAT_ORGANIZATION_ROOMS!.ensure('unclaimed'), /Claim this organization/);
    assert.equal(chat.sqlite.prepare("SELECT role FROM chat_conversation_members WHERE user_id='alice'").get()!.role, 'owner');
    assert.equal(await provisionOrganizationChat(env, 'lifetech'), true);
    assert.equal(chat.sqlite.prepare('SELECT count(*) n FROM chat_conversations').get()!.n, 2);
    chat.sqlite.exec("UPDATE chat_conversation_members SET state='blocked' WHERE user_id='alice'");
    org.sqlite.exec("UPDATE organization_memberships SET role='member' WHERE user_id='alice'");
    await provisionPendingOrganizationChats(env);
    assert.equal(chat.sqlite.prepare("SELECT state FROM chat_conversation_members WHERE user_id='alice'").get()!.state, 'blocked');
    await Promise.all([env.CHAT_ORGANIZATION_ROOMS!.ensure('existing'), env.CHAT_ORGANIZATION_ROOMS!.ensure('existing')]);
    assert.equal(chat.sqlite.prepare('SELECT count(*) n FROM chat_conversations').get()!.n, 2);
    org.sqlite.exec("UPDATE organizations SET name='LifeTech Baltimore' WHERE id='lifetech'");
    await provisionPendingOrganizationChats(env);
    assert.equal(chat.sqlite.prepare("SELECT title FROM chat_conversations WHERE org_id='lifetech'").get()!.title, 'LifeTech Baltimore Chat');
    const ensure = env.CHAT_ORGANIZATION_ROOMS!.ensure;
    env.CHAT_ORGANIZATION_ROOMS!.ensure = async id => {
      const room = await ensure(id);
      org.sqlite.exec("UPDATE organizations SET name='LifeTech' WHERE id='lifetech'");
      return room;
    };
    await provisionOrganizationChat(env, 'lifetech');
    assert.equal(org.sqlite.prepare("SELECT completed_at FROM organization_chat_provisioning WHERE organization_id='lifetech'").get()!.completed_at, null);
    env.CHAT_ORGANIZATION_ROOMS!.ensure = ensure;
    await provisionPendingOrganizationChats(env);
    assert.equal(chat.sqlite.prepare("SELECT title FROM chat_conversations WHERE org_id='lifetech'").get()!.title, 'LifeTech Chat');
    await assert.rejects(() => env.CHAT_ORGANIZATION_ROOMS!.ensure('unknown'));
    // A failed organization transaction cannot leave a provisioning job behind.
    org.sqlite.exec('BEGIN');
    org.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('rolled-back','Rollback','rollback')");
    org.sqlite.exec('ROLLBACK');
    assert.equal(org.sqlite.prepare("SELECT count(*) n FROM organization_chat_provisioning WHERE organization_id='rolled-back'").get()!.n, 0);
  } finally { org.sqlite.close(); chat.sqlite.close(); }
});
