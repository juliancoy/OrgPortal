import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

test('site schema migrates in place with intact identities, progress, foreign keys, and journal history', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    const directory = new URL('../migrations/', import.meta.url);
    for (const name of readdirSync(directory).filter(name => name.endsWith('.sql') && Number(name.slice(0, 4)) < 83).sort()) {
      db.exec(readFileSync(new URL(name, directory), 'utf8'));
    }
    db.exec(`INSERT INTO organizations(id,name,slug) VALUES('group','Group','group');
      INSERT INTO organization_memberships(organization_id,user_id,role,status,onboarding_tenant_id)
        VALUES('group','person','member','active','orgportal');
      INSERT INTO onboarding_enrollments(tenant_id,user_id,start_date,end_date,completed_at)
        VALUES('orgportal','person','2026-10-01','2026-11-01','2026-10-02');
      INSERT INTO user_tasks(id,tenant_id,user_id,created_by_user_id,kind,title)
        VALUES('task','orgportal','person','person','personal','Attend a meeting');`);
    const journal = db.prepare('SELECT * FROM change_journal ORDER BY sequence').all();
    const sites = db.prepare('SELECT * FROM portal_tenants ORDER BY id').all();
    const migration = readFileSync(new URL('0083_group_sites.sql', directory), 'utf8');
    db.exec('BEGIN');
    db.exec(migration);
    db.exec('ROLLBACK');
    assert.deepEqual(db.prepare('SELECT * FROM portal_tenants ORDER BY id').all(), sites);
    db.exec(migration);
    assert.deepEqual(db.prepare('SELECT * FROM group_sites ORDER BY id').all(), sites);
    assert.deepEqual(db.prepare('SELECT * FROM change_journal ORDER BY sequence').all(), journal);
    assert.equal(db.prepare("SELECT user_id FROM organization_memberships WHERE onboarding_group_site_id='orgportal'").get()!.user_id, 'person');
    assert.equal(db.prepare("SELECT completed_at FROM onboarding_enrollments WHERE group_site_id='orgportal' AND user_id='person'").get()!.completed_at, '2026-10-02');
    assert.equal(db.prepare("SELECT id FROM user_tasks WHERE group_site_id='orgportal' AND user_id='person'").get()!.id, 'task');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    for (const row of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
      assert.ok(!String(row.name).includes('tenant'));
      for (const column of db.prepare(`PRAGMA table_info("${row.name}")`).all()) assert.ok(!String(column.name).includes('tenant'));
    }
    for (const row of db.prepare('SELECT table_name,columns_json FROM change_journal_coverage').all()) {
      assert.deepEqual(db.prepare(`PRAGMA table_info("${row.table_name}")`).all().map(column => column.name), JSON.parse(String(row.columns_json)));
    }
    db.exec("UPDATE group_sites SET tagline='New branding' WHERE id='orgportal'");
    assert.equal(db.prepare('SELECT table_name FROM change_journal ORDER BY sequence DESC LIMIT 1').get()!.table_name, 'group_sites');
    db.exec("UPDATE user_tasks SET title='Meet your group' WHERE id='task'");
    const entry = db.prepare('SELECT after_json FROM change_journal ORDER BY sequence DESC LIMIT 1').get()!;
    assert.equal(JSON.parse(String(entry.after_json)).group_site_id, 'orgportal');
    assert.equal('tenant_id' in JSON.parse(String(entry.after_json)), false);
  } finally { db.close(); }
});
