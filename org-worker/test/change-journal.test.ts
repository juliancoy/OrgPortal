import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { replicateChangeJournal } from '../src/changeJournal'
import { mirrorChangeJournal } from '../scripts/journal-mirror.mjs'

class Database {
  readonly sqlite = new DatabaseSync(':memory:')
  prepare(sql: string) {
    const stmt = this.sqlite.prepare(sql)
    const bound = (values: any[] = []) => ({
      bind: (...args: any[]) => bound(args),
      first: async () => stmt.get(...values) || null,
      all: async () => ({ results: stmt.all(...values), success: true }),
      execute: () => stmt.run(...values),
    })
    return bound()
  }
  async batch(statements: Array<{ execute: () => unknown }>) {
    this.sqlite.exec('BEGIN IMMEDIATE')
    try { const results = statements.map(stmt => stmt.execute()); this.sqlite.exec('COMMIT'); return results }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error }
  }
}
function fixture() {
  const primary = new Database(), secondary = new Database()
  const folder = new URL('../migrations/', import.meta.url)
  for (const name of readdirSync(folder).filter(name => name.endsWith('.sql')).sort()) primary.sqlite.exec(readFileSync(new URL(name, folder), 'utf8'))
  secondary.sqlite.exec(readFileSync(new URL('../journal-migrations/0001_change_journal.sql', import.meta.url), 'utf8'))
  const env = { DB: primary, JOURNAL_DB: secondary } as unknown as Env
  // Seed migrations after journal creation are audited too. Measure scenario writes
  // relative to that immutable history rather than assuming an empty journal.
  const baseline = Number(primary.sqlite.prepare('SELECT COALESCE(MAX(sequence),0) n FROM change_journal').get()!.n)
  return { primary, secondary, env, baseline, close: () => { primary.sqlite.close(); secondary.sqlite.close() } }
}

test('direct SQL writes journal before/after state and roll back atomically; no-op updates are inert', () => {
  const f = fixture()
  try {
    f.primary.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('org','Original','org')")
    f.primary.sqlite.exec("UPDATE organizations SET name=name WHERE id='org'")
    assert.equal(f.primary.sqlite.prepare('SELECT COUNT(*) n FROM change_journal').get()!.n, f.baseline + 1)
    f.primary.sqlite.exec("BEGIN; UPDATE organizations SET name='Rolled back' WHERE id='org'; ROLLBACK")
    assert.equal(f.primary.sqlite.prepare('SELECT COUNT(*) n FROM change_journal').get()!.n, f.baseline + 1)
    f.primary.sqlite.exec("UPDATE organizations SET name='Renamed' WHERE id='org'")
    f.primary.sqlite.exec("DELETE FROM organizations WHERE id='org'")
    const rows = f.primary.sqlite.prepare('SELECT * FROM change_journal WHERE sequence > ? ORDER BY sequence').all(f.baseline)
    assert.deepEqual(rows.map(row => row.operation), ['insert', 'update', 'delete'])
    assert.equal(JSON.parse(String(rows[1].before_json)).name, 'Original')
    assert.equal(JSON.parse(String(rows[1].after_json)).name, 'Renamed')
    assert.equal(rows[2].after_json, null)
    assert.throws(() => f.primary.sqlite.exec('DELETE FROM change_journal'))
    assert.throws(() => f.primary.sqlite.exec("UPDATE change_journal SET operation='delete'"))
  } finally { f.close() }
})

test('credential columns are redacted and replica refreshes are excluded while local newsletters are captured', () => {
  const f = fixture()
  try {
    f.primary.sqlite.exec("INSERT INTO event_calendar_feeds(user_id,token) VALUES('user','private-token')")
    const entry = f.primary.sqlite.prepare("SELECT after_json FROM change_journal WHERE table_name='event_calendar_feeds'").get()!
    assert.equal(JSON.parse(String(entry.after_json)).token, '[REDACTED]')
    assert.ok(!String(entry.after_json).includes('private-token'))
    f.primary.sqlite.exec("INSERT INTO organization_replica_state(id,source) VALUES(1,'https://lifetech.fyi/api/org/api/network/replication/snapshot')")
    f.primary.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('replicated','Replica','replicated')")
    assert.equal(f.primary.sqlite.prepare("SELECT COUNT(*) n FROM change_journal WHERE table_name='organizations'").get()!.n, 0)
    f.primary.sqlite.exec("INSERT INTO ecosystem_sync_changes(id,entity,record_id,replica_id,counter,deleted,value_json) VALUES('local','newsletter','issue','browser',1,0,'{}')")
    assert.equal(f.primary.sqlite.prepare("SELECT COUNT(*) n FROM change_journal WHERE table_name='ecosystem_sync_changes'").get()!.n, 1)
  } finally { f.close() }
})

test('every primary application table has explicit coverage or exclusion; trigger generation is reproducible', () => {
  const f = fixture()
  try {
    const tables = f.primary.sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'change_journal%'").all().map(row => row.name).sort()
    const policy = f.primary.sqlite.prepare('SELECT table_name FROM change_journal_coverage UNION SELECT table_name FROM change_journal_exclusions').all().map(row => row.table_name).sort()
    assert.deepEqual(tables, policy)
    for (const row of f.primary.sqlite.prepare('SELECT table_name,columns_json FROM change_journal_coverage').all()) {
      const columns = f.primary.sqlite.prepare('PRAGMA table_info("' + String(row.table_name).replaceAll('"', '""') + '")').all().map(column => column.name)
      assert.deepEqual(columns, JSON.parse(String(row.columns_json)), 'Journal columns must match ' + row.table_name)
    }
    const generated = execFileSync('python3', ['-c', 'import importlib.util; s=importlib.util.spec_from_file_location("journal","scripts/generate-change-journal.py");m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(m.generate(),end="")'], { cwd: new URL('../../', import.meta.url), encoding: 'utf8' })
    assert.equal(generated, readFileSync(new URL('../migrations/0073_change_journal.sql', import.meta.url), 'utf8'))
  } finally { f.close() }
})

test('secondary copy retries are inert, checkpoints are atomic and rewinds fail safely', async () => {
  const f = fixture()
  try {
    f.primary.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('org','First','org'); UPDATE organizations SET name='Second' WHERE id='org'")
    const result = await replicateChangeJournal(f.env)
    assert.equal(result!.cursor, f.baseline + 2)
    await replicateChangeJournal(f.env)
    assert.equal(f.secondary.sqlite.prepare('SELECT COUNT(*) n FROM journal_entries').get()!.n, f.baseline + 2)
    assert.throws(() => f.secondary.sqlite.exec('DELETE FROM journal_entries'))
    // Simulate a stale checkpoint: replaying the page cannot duplicate entries.
    f.secondary.sqlite.exec('UPDATE journal_checkpoints SET sequence=0')
    await replicateChangeJournal(f.env)
    assert.equal(f.secondary.sqlite.prepare('SELECT sequence FROM journal_checkpoints').get()!.sequence, f.baseline + 2)
    // A source identity restored to an older head must never erase the backup.
    f.secondary.sqlite.exec('UPDATE journal_checkpoints SET sequence=999')
    await assert.rejects(replicateChangeJournal(f.env), /rewound/)
    assert.equal(f.secondary.sqlite.prepare('SELECT COUNT(*) n FROM journal_entries').get()!.n, f.baseline + 2)
  } finally { f.close() }
})

test('corrupted immutable copies abort the page without advancing its checkpoint', async () => {
  const f = fixture()
  try {
    f.primary.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('org','First','org')")
    await replicateChangeJournal(f.env)
    f.secondary.sqlite.exec("DROP TRIGGER journal_entries_no_update; UPDATE journal_entries SET fingerprint='corrupt'; UPDATE journal_checkpoints SET sequence=0")
    f.secondary.sqlite.exec("CREATE TRIGGER journal_entries_no_update BEFORE UPDATE ON journal_entries BEGIN SELECT RAISE(ABORT,'immutable'); END")
    await assert.rejects(replicateChangeJournal(f.env), /immutable/)
    assert.equal(f.secondary.sqlite.prepare('SELECT sequence FROM journal_checkpoints').get()!.sequence, 0)
  } finally { f.close() }
})

test('local WAL mirror survives process restart, retains exact rows and resumes without duplication', async () => {
  const f = fixture(), directory = mkdtempSync(join(tmpdir(), 'orgportal-journal-')), file = join(directory, 'journal.sqlite')
  try {
    f.primary.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('org','First','org')")
    await replicateChangeJournal(f.env)
    const query = async (sql: string) => f.secondary.sqlite.prepare(sql).all()
    const first = await mirrorChangeJournal(file, query)
    assert.equal(first.entries, f.baseline + 1); assert.equal(first.journalMode, 'wal')
    assert.equal(statSync(file).mode & 0o777, 0o600)
    assert.equal((await mirrorChangeJournal(file, query)).entries, f.baseline + 1)
    f.primary.sqlite.exec("UPDATE organizations SET name='Next' WHERE id='org'")
    await replicateChangeJournal(f.env)
    assert.equal((await mirrorChangeJournal(file, query)).entries, f.baseline + 2)
    const db = new DatabaseSync(file)
    try { assert.equal(db.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok'); assert.equal(db.prepare('PRAGMA synchronous').get()!.synchronous, 2) }
    finally { db.close() }
  } finally { f.close(); rmSync(directory, { recursive: true, force: true }) }
})


test('ballot settings and rosters are audited but cleared company votes never enter immutable copies', () => {
 const f = fixture()
 try {
  f.primary.sqlite.exec(`INSERT INTO events(id,ingest_key,title,slug) VALUES('pitch-fixture','pitch-fixture','Pitch','pitch-fixture');
   INSERT INTO organizations(id,name,slug) VALUES('pitch-company','Company','pitch-company');
   INSERT INTO event_company_ballots(event_id,closes_at,enabled) VALUES('pitch-fixture','2099-10-09T00:00:00Z',1);
   INSERT INTO event_pitch_companies VALUES('pitch-fixture','pitch-company');
   INSERT INTO event_company_votes(event_id,organization_id,user_id,value,expires_at)
   VALUES('pitch-fixture','pitch-company','private-voter',1,'2099-12-01T00:00:00Z');
   DELETE FROM event_company_votes WHERE user_id='private-voter';
   UPDATE event_company_ballots SET mode='favorites',selection_fraction=0.5 WHERE event_id='pitch-fixture';
   INSERT INTO event_company_favorites(event_id,organization_id,user_id,expires_at)
   VALUES('pitch-fixture','pitch-company','private-favorite-voter','2099-12-01T00:00:00Z');
   DELETE FROM event_company_favorites WHERE user_id='private-favorite-voter';`)
  const config = f.primary.sqlite.prepare("SELECT table_name FROM change_journal WHERE table_name IN ('event_company_ballots','event_pitch_companies') ORDER BY sequence").all()
  assert.deepEqual(config.map(row=>row.table_name),['event_company_ballots','event_pitch_companies','event_company_ballots'])
  assert.equal(f.primary.sqlite.prepare("SELECT COUNT(*) n FROM change_journal WHERE table_name IN ('event_company_votes','event_company_favorites') OR after_json LIKE '%private-voter%' OR before_json LIKE '%private-voter%'").get()!.n,0)
  assert.equal(f.primary.sqlite.prepare('SELECT COUNT(*) n FROM event_company_votes').get()!.n,0)
  assert.equal(f.primary.sqlite.prepare('SELECT COUNT(*) n FROM event_company_favorites').get()!.n,0)
  const last=f.primary.sqlite.prepare("SELECT after_json FROM change_journal WHERE table_name='event_company_ballots' ORDER BY sequence DESC LIMIT 1").get()!
  assert.equal(JSON.parse(String(last.after_json)).mode,'favorites')
  assert.equal(JSON.parse(String(last.after_json)).selection_fraction,0.5)
 } finally { f.close() }
})

test('availability visibility changes are audited atomically and no-op saves are inert', () => {
 const f = fixture()
 try {
  f.primary.sqlite.exec("INSERT INTO profile_availability_settings(user_id) VALUES('alice'); UPDATE profile_availability_settings SET public=1 WHERE user_id='alice'")
  f.primary.sqlite.exec("UPDATE profile_availability_settings SET public=public WHERE user_id='alice'")
  const rows = f.primary.sqlite.prepare("SELECT operation,before_json,after_json FROM change_journal WHERE table_name='profile_availability_settings'").all()
  assert.deepEqual(rows.map(row=>row.operation),['insert','update'])
  assert.equal(JSON.parse(String(rows[1].before_json)).public,0)
  assert.equal(JSON.parse(String(rows[1].after_json)).public,1)
  f.primary.sqlite.exec("BEGIN; UPDATE profile_availability_settings SET public=0 WHERE user_id='alice'; ROLLBACK")
  assert.equal(f.primary.sqlite.prepare("SELECT COUNT(*) n FROM change_journal WHERE table_name='profile_availability_settings'").get()!.n,2)
 } finally { f.close() }
})
