import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { calendarCollectionOptions, addCalendarCollections } from '../src/calendarCollections';

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const file of ['0002_org_event_directories.sql', '0044_event_history.sql'])
    sql.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  sql.exec(`INSERT INTO organizations(id,name,slug) VALUES('life','LifeTech','lifetech'),('host','Real Host','host');
    INSERT INTO events(id,ingest_key,title,slug,host_org_id,tags) VALUES('event','key','Original title','original','host','["Health"]');`);
  const db = {
    prepare(query: string) {
      const statement = sql.prepare(query);
      const bound = (args: any[]) => ({ bind: (...args: any[]) => bound(args),
        first: async () => statement.get(...args) || null,
        run: async () => statement.run(...args) });
      return bound([]);
    },
    async batch(statements: {run(): Promise<unknown>}[]) {
      sql.exec('BEGIN');
      try { const results=[]; for (const stmt of statements) results.push(await stmt.run()); sql.exec('COMMIT'); return results; }
      catch(error) { sql.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
  return {sql,db};
}

test('resolve collections before writing and reject missing or malformed targets', async () => {
  const {sql,db}=database();
  assert.deepEqual(await calendarCollectionOptions(db,{}), {organizationIds:[],preserveExisting:false});
  assert.deepEqual(await calendarCollectionOptions(db,{organization_slugs:['lifetech','lifetech'],preserve_existing:true}), {organizationIds:['life'],preserveExisting:true});
  await assert.rejects(calendarCollectionOptions(db,{organization_slugs:['missing']}), /not found/);
  await assert.rejects(calendarCollectionOptions(db,{organization_slugs:'lifetech'}), /Invalid/);
  sql.close();
});

test('associate and merge tags idempotently without reassigning the host or event metadata', async () => {
  const {sql,db}=database();
  await addCalendarCollections(db,'event',['life'],['Pitch Competition']);
  await addCalendarCollections(db,'event',['life'],['Pitch Competition']);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM event_organizations').get()!.n,1);
  const event=sql.prepare('SELECT * FROM events WHERE id=?').get('event')!;
  assert.equal(event.host_org_id,'host'); assert.equal(event.title,'Original title'); assert.equal(event.slug,'original');
  assert.deepEqual(JSON.parse(event.tags as string).sort(),['Health','Pitch Competition']);
  await assert.rejects(addCalendarCollections(db,'event',['missing'],['Must roll back']));
  assert.equal(sql.prepare('SELECT tags FROM events WHERE id=?').get('event')!.tags,event.tags);
  sql.close();
});
