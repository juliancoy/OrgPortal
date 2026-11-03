import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { app } from '../src/index'
import { chatDeviceId, encodeChatBytes, type ChatDeviceKey, type ChatSecurity } from '../../shared/chatEncryption'

// Real SQLite exercises the migration, triggers and conditional INSERT together.
class LocalD1 {
  sql = new DatabaseSync(':memory:')
  beforeInsert?: () => void
  async batch(statements: {run: () => Promise<unknown>}[]) { return Promise.all(statements.map(statement => statement.run())) }
  prepare(query: string) {
    const db = this
    function statement(params: SQLInputValue[] = []) {
      return {
        bind: (...values: SQLInputValue[]) => statement(values),
        first: async () => db.sql.prepare(query).get(...params) || null,
        all: async () => ({ results: db.sql.prepare(query).all(...params) }),
        run: async () => {
          if (query.includes('INSERT INTO chat_messages') && db.beforeInsert) { const fn = db.beforeInsert; db.beforeInsert = undefined; fn() }
          return { success: true, meta: { changes: Number(db.sql.prepare(query).run(...params).changes) } }
        },
      }
    }
    return statement()
  }
}
function fixture() {
  const db = new LocalD1()
  db.sql.exec('PRAGMA foreign_keys=ON')
  const directory = new URL('../migrations/', import.meta.url)
  for (const name of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) db.sql.exec(readFileSync(new URL(name, directory), 'utf8'))
  db.sql.exec(`CREATE TABLE organization_memberships(organization_id TEXT,user_id TEXT,role TEXT,status TEXT);
    CREATE TABLE events(id TEXT,host_user_id TEXT,host_org_id TEXT);
    CREATE TABLE user_contact_pages(user_id TEXT,photo_url TEXT);
    INSERT INTO organization_memberships VALUES ('org-a','alice','owner','active'),('org-a','bob','member','active'),('org-b','eve','owner','active');
    INSERT INTO events VALUES ('event-a','bob',NULL);`)
  const env = { DB: db, CONTACTS_DB: db, PIDP_BASE_URL: 'https://synthetic-id.test' } as unknown as Env
  const room = (id: string, kind = 'org_room', org = 'org-a') => {
    db.sql.prepare(`INSERT INTO chat_conversations(id,kind,created_by_user_id,org_id,event_id,created_at,updated_at) VALUES (?,?, 'alice',?,'event-a','2026-01-01','2026-01-01')`).run(id, kind, org)
    for (const [user, role] of [['alice','owner'],['bob','member']]) db.sql.prepare(`INSERT INTO chat_conversation_members(conversation_id,user_id,role,state,joined_at) VALUES (?,?,?,'active','2026-01-01')`).run(id,user,role)
  }
  room('room-a'); room('room-b', 'org_room', 'org-b'); room('event-room', 'event_room')
  async function request(path: string, method = 'GET', body?: unknown, user = 'alice') {
    return app.request(`https://synthetic-chat.test/api/network/chat/${path}`, { method, headers: {authorization:`Bearer ${user}`,'content-type':'application/json'}, body: body === undefined ? undefined : JSON.stringify(body) }, env)
  }
  return { db, request, security: async (room = 'room-a', user = 'alice') => (await (await request(`conversations/${room}/security`, 'GET', undefined, user)).json()) as ChatSecurity }
}
const originalFetch = globalThis.fetch
test.before(() => { globalThis.fetch = async (_input, init) => Response.json({ id: new Headers(init?.headers).get('authorization')?.slice(7), full_name: 'Synthetic Member' }) })
test.after(() => { globalThis.fetch = originalFetch })
async function key(user: string, discriminator = 1): Promise<ChatDeviceKey> {
  const modulus = new Uint8Array(384); modulus[0] = 128; modulus[1] = discriminator; modulus[383] = 1
  const rsa_jwk = { kty: 'RSA' as const, n: encodeChatBytes(modulus), e: 'AQAB' as const }, kem_public = encodeChatBytes(new Uint8Array(1184))
  return { user_id: user, device_id: await chatDeviceId(user, rsa_jwk, kem_public), rsa_jwk, kem_public }
}
function envelope(state: ChatSecurity, id = 'client-a') {
  return { v:1, mode:state.mode, revision:state.revision, conversation_id:'room-a', client_message_id:id, sender_user_id:'alice', sender_device_id:state.devices.find(d => d.user_id === 'alice')!.device_id,
    nonce:encodeChatBytes(new Uint8Array(12)), ciphertext:encodeChatBytes(new Uint8Array(32)), recipients:state.devices.map(d => ({user_id:d.user_id,device_id:d.device_id,rsa_ciphertext:encodeChatBytes(new Uint8Array(384)),kem_ciphertext:state.mode === 'rsa-mlkem' ? encodeChatBytes(new Uint8Array(1088)) : undefined,nonce:encodeChatBytes(new Uint8Array(12)),wrapped_key:encodeChatBytes(new Uint8Array(48))})) }
}
test('authoritative chat permissions, event host permissions, and tenant isolation', async () => {
  const f = fixture()
  assert.equal((await f.security()).can_manage, true)
  assert.equal((await f.security('room-a','bob')).can_manage, false)
  assert.equal((await f.request('conversations/room-a/security','PATCH',{mode:'none',expected_revision:2},'bob')).status,403)
  assert.equal((await f.request('conversations/room-b/security')).status,403)
  assert.equal((await f.security('event-room')).can_manage,false) // first commenter owns stored room, not the event
  assert.equal((await f.security('event-room','bob')).can_manage,true)
  f.db.sql.exec("UPDATE organization_memberships SET status='left' WHERE user_id='alice'")
  assert.equal((await f.request('conversations/room-a/security','PATCH',{mode:'none',expected_revision:2})).status,403)
})
test('organization organizers can open chat and use current administrator controls', async () => {
  const f = fixture()
  f.db.sql.exec(`CREATE TABLE organizations(id TEXT,name TEXT,slug TEXT);
    CREATE TABLE organization_ownerships(organization_id TEXT,owner_user_id TEXT,status TEXT);
    INSERT INTO organizations VALUES ('org-a','Synthetic Org','synthetic-org');
    INSERT INTO organization_ownerships VALUES ('org-a','alice','active');
    ALTER TABLE organization_memberships ADD COLUMN user_name TEXT;
    UPDATE organization_memberships SET role='organizer' WHERE user_id='alice';`)
  assert.equal((await f.request('org-room','POST',{organization_slug:'synthetic-org'})).status,200)
  assert.equal((await f.security('org-room-org-a')).can_manage,true)
  assert.equal(f.db.sql.prepare("SELECT role FROM chat_conversation_members WHERE conversation_id='org-room-org-a' AND user_id='alice'").get()!.role,'admin')
})
test('public device registration rejects private keys, isolates accounts and renews without roster churn', async () => {
  const f = fixture(), alice = await key('alice')
  assert.equal((await f.request('devices','POST',{...alice,rsa_jwk:{...alice.rsa_jwk,d:'secret'}})).status,400)
  assert.equal((await f.request('devices','POST',alice)).status,200)
  const first = await f.security()
  assert.equal((await f.request('devices','POST',alice)).status,200)
  assert.equal((await f.security()).revision,first.revision)
  assert.equal((await f.request(`devices/${alice.device_id}`,'DELETE',undefined,'bob')).status,200)
  assert.equal((await f.security()).devices.length,1)
  f.db.sql.exec("UPDATE chat_device_keys SET expires_at='2000-01-01'")
  assert.equal((await f.security()).devices.length,0)
  assert.equal((await f.request('devices','POST',alice)).status,200)
  assert.ok((await f.security()).revision > first.revision)
  await f.request(`devices/${alice.device_id}`,'DELETE')
  assert.equal((await f.security()).devices.length,0)
})
test('account device limit is bounded and existing registrations can still renew', async () => {
  const f = fixture()
  for (let i=1;i<=8;i++) assert.equal((await f.request('devices','POST',await key('alice',i))).status,200)
  assert.equal((await f.request('devices','POST',await key('alice',9))).status,409)
  assert.equal((await f.request('devices','POST',await key('alice',1))).status,200)
  assert.equal((await f.security()).devices.length,8)
})
test('encrypted modes reject cleartext, missing recipients, stale revisions, and cross-room replay; persist ciphertext only', async () => {
  const f = fixture()
  await f.request('devices','POST',await key('alice'))
  let state = await f.security()
  assert.equal((await f.request('conversations/room-a/security','PATCH',{mode:'rsa-mlkem',expected_revision:state.revision})).status,200)
  assert.equal((await f.request('conversations/room-a/messages','POST',{body:'plaintext',client_message_id:'clear'})).status,409)
  state = await f.security()
  assert.equal((await f.request('conversations/room-a/messages','POST',{encryption:envelope(state),client_message_id:'client-a'})).status,409)
  await f.request('devices','POST',await key('bob'), 'bob')
  state = await f.security()
  const data = envelope(state)
  for (const invalid of [{...data,revision:state.revision-1},{...data,conversation_id:'room-b'},{...data,recipients:data.recipients.slice(0,1)},{...data,mode:'rsa'}]) {
    assert.notEqual((await f.request('conversations/room-a/messages','POST',{client_message_id:'client-a',encryption:invalid})).status,201)
  }
  const response = await f.request('conversations/room-a/messages','POST',{body:'MUST NOT BE STORED',client_message_id:'client-a',encryption:data})
  assert.equal(response.status,201,await response.clone().text())
  const stored = f.db.sql.prepare('SELECT body,encryption FROM chat_messages').get()!
  assert.equal(stored.body,'Encrypted message'); assert.equal(stored.encryption,JSON.stringify(data))
  assert.equal((await f.request('conversations/room-a/messages','POST',{client_message_id:'client-a',encryption:data})).status,200)
  assert.equal((await f.request('conversations/room-a/security','PATCH',{mode:'none',expected_revision:state.revision-1})).status,409)
  f.db.beforeInsert = () => f.db.sql.exec("UPDATE chat_conversation_members SET state='left' WHERE conversation_id='room-a' AND user_id='bob'")
  assert.equal((await f.request('conversations/room-a/messages','POST',{client_message_id:'race',encryption:envelope(state,'race')})).status,409)
  assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM chat_messages').get()!.n,1)
})
test('additive migration preserves old content, receipt updates preserve revision, and room deletion cascades', async () => {
  const f = fixture()
  assert.equal((await f.request('conversations/room-a/messages','POST',{body:'Legacy plaintext',client_message_id:'legacy'})).status,201)
  const before = (await f.security()).revision
  f.db.sql.exec("UPDATE chat_conversation_members SET last_read_at='2026-10-01' WHERE conversation_id='room-a'")
  assert.equal((await f.security()).revision,before)
  assert.equal(f.db.sql.prepare('SELECT body,encryption FROM chat_messages').get()!.encryption,null)
  f.db.sql.exec("DELETE FROM chat_conversations WHERE id='room-a'")
  assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM chat_messages').get()!.n,0)
  assert.equal(f.db.sql.prepare("SELECT COUNT(*) AS n FROM chat_conversation_members WHERE conversation_id='room-a'").get()!.n,0)
})
test('migration preserves pre-existing history and anonymous event reads omit encrypted envelopes', async () => {
  const db = new LocalD1(), directory = new URL('../migrations/',import.meta.url)
  for (const name of readdirSync(directory).filter(name => name.endsWith('.sql') && !name.startsWith('0005')).sort()) db.sql.exec(readFileSync(new URL(name,directory),'utf8'))
  db.sql.exec(`INSERT INTO chat_conversations(id,kind,created_by_user_id,created_at,updated_at) VALUES ('legacy','event_room','alice','2026-01-01','2026-01-01');
    INSERT INTO chat_messages(id,conversation_id,sender_user_id,body,sequence,created_at) VALUES ('old','legacy','alice','Original history',1,'2026-01-01');`)
  db.sql.exec(readFileSync(new URL('0005_chat_encryption.sql',directory),'utf8'))
  const old = db.sql.prepare('SELECT body,encryption FROM chat_messages').get()!
  assert.equal(old.body,'Original history');assert.equal(old.encryption,null)
  db.sql.exec(`INSERT INTO chat_messages(id,conversation_id,sender_user_id,body,sequence,created_at,encryption) VALUES ('secret','legacy','alice','Encrypted message',2,'2026-01-02','{"private_recipient_metadata":true}');`)
  db.sql.exec('CREATE TABLE user_contact_pages(user_id TEXT,photo_url TEXT)')
  const env = {DB:db,CONTACTS_DB:db} as unknown as Env
  const response = await app.request('https://synthetic-chat.test/api/network/public/event-chat/legacy/messages',{},env)
  assert.equal(response.status,200)
  const result = await response.json() as {messages:{id:string}[]}
  assert.deepEqual(result.messages.map(m=>m.id),['old'])
  assert.ok(!JSON.stringify(result).includes('private_recipient_metadata'))
})
