import { DatabaseSync } from 'node:sqlite';
import { mkdir, chmod, lstat, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { fingerprint } from './newsletter-sync.mjs';

const worker = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);

export function acceptJournalPage(db, sourceId, rows) {
  if (!/^[a-f0-9]{32}$/.test(sourceId) || !rows.length || rows.length > 20) throw Error('Invalid journal page');
  let previous = 0;
  for (const row of rows) {
    const { sequence, table_name, record_key, operation, before_json, after_json, recorded_at } = row;
    if (row.source_id !== sourceId || !Number.isSafeInteger(sequence) || sequence <= previous ||
        row.fingerprint !== fingerprint({ sequence, table_name, record_key, operation, before_json, after_json, recorded_at })) throw Error('Corrupt or unordered journal page');
    previous = sequence;
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const insert = db.prepare(`INSERT INTO journal_entries(source_id,sequence,table_name,record_key,operation,before_json,after_json,recorded_at,fingerprint)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id,sequence) DO UPDATE SET fingerprint=excluded.fingerprint WHERE fingerprint!=excluded.fingerprint`);
    for (const row of rows) insert.run(sourceId, row.sequence, row.table_name, row.record_key, row.operation, row.before_json, row.after_json, row.recorded_at, row.fingerprint);
    db.prepare(`INSERT INTO journal_checkpoints(source_id,sequence,updated_at) VALUES(?,?,?)
      ON CONFLICT(source_id) DO UPDATE SET sequence=MAX(sequence,excluded.sequence),updated_at=excluded.updated_at`).run(sourceId, previous, new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

async function remoteQuery(sql) {
  const { stdout } = await execute(process.execPath, [resolve(worker, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute',
    'org-journal', '--config', resolve(worker, 'journal.wrangler.jsonc'), '--remote', '--json', '--command', sql],
    { cwd: worker, env: { ...process.env, CI: 'true' }, timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  const reply = JSON.parse(stdout);
  if (!reply[0]?.success || !Array.isArray(reply[0].results)) throw Error('Invalid secondary journal response');
  return reply[0].results;
}

export async function mirrorChangeJournal(file, query = remoteQuery) {
  file = resolve(file);
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const info = await lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (info && (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid())) throw Error('Journal file must be a regular file owned by your account');
  // Pre-create privately so SQLite's WAL and SHM files inherit private modes.
  if (!info) { const { writeFile } = await import('node:fs/promises'); await writeFile(file, '', { mode: 0o600, flag: 'wx' }); }
  await chmod(file, 0o600);
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version === 0) {
      if (db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").get()) throw Error('Choose a dedicated empty journal database');
      db.exec('BEGIN IMMEDIATE');
      try { db.exec(await readFile(new URL('../journal-migrations/0001_change_journal.sql', import.meta.url), 'utf8')); db.exec('PRAGMA user_version=1; COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    } else if (version !== 1) throw Error('Unsupported journal schema version');
    const streams = await query('SELECT source_id,sequence FROM journal_checkpoints ORDER BY source_id');
    for (const stream of streams) {
      if (!/^[a-f0-9]{32}$/.test(stream.source_id) || !Number.isSafeInteger(stream.sequence)) throw Error('Invalid remote journal checkpoint');
      let cursor = db.prepare('SELECT sequence FROM journal_checkpoints WHERE source_id=?').get(stream.source_id)?.sequence || 0;
      if (cursor > stream.sequence) throw Error('Secondary journal was rewound; keep the existing local history');
      while (cursor < stream.sequence) {
        const rows = await query(`SELECT * FROM journal_entries WHERE source_id='${stream.source_id}' AND sequence>${cursor} AND sequence<=${stream.sequence} ORDER BY sequence LIMIT 20`);
        if (!rows.length) throw Error('Journal page is missing before its checkpoint');
        acceptJournalPage(db, stream.source_id, rows);
        cursor = rows.at(-1).sequence;
      }
    }
    return { file, entries: db.prepare('SELECT COUNT(*) n FROM journal_entries').get().n,
      journalMode: db.prepare('PRAGMA journal_mode').get().journal_mode, checkpoints: db.prepare('SELECT * FROM journal_checkpoints ORDER BY source_id').all() };
  } finally { db.close(); }
}
