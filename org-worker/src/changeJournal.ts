import { contentHash } from '../../shared/newsletterStorage'

export type JournalRow = {
  sequence: number; table_name: string; record_key: string; operation: 'insert' | 'update' | 'delete';
  before_json: string | null; after_json: string | null; recorded_at: string
}

/** Copy only committed rows. Checkpoints live with the copy, never the source. */
export async function replicateChangeJournal(env: Pick<Env, 'DB' | 'JOURNAL_DB' | 'ORGANIZATION_REPLICA_SOURCE'>) {
  if (env.ORGANIZATION_REPLICA_SOURCE || !env.JOURNAL_DB) return
  const source = await env.DB.prepare('SELECT source_id FROM change_journal_source WHERE id=1').first<{ source_id: string }>()
  if (!source) throw Error('Primary journal identity is missing')
  const head = await env.DB.prepare('SELECT COALESCE(MAX(sequence),0) sequence FROM change_journal').first<{ sequence: number }>()
  const checkpoint = await env.JOURNAL_DB.prepare('SELECT sequence FROM journal_checkpoints WHERE source_id=?').bind(source.source_id).first<{ sequence: number }>()
  let cursor = checkpoint?.sequence || 0
  if (cursor > (head?.sequence || 0)) throw Error('Primary journal was rewound; rotate its source identity before resuming')
  // Bounded cron work; subsequent runs drain the remaining committed outbox.
  for (let page = 0; page < 5; page++) {
    const rows = await env.DB.prepare('SELECT * FROM change_journal WHERE sequence>? ORDER BY sequence LIMIT 20').bind(cursor).all<JournalRow>()
    if (!rows.results.length) return { sourceId: source.source_id, cursor }
    const statements: D1PreparedStatement[] = []
    for (const row of rows.results) statements.push(env.JOURNAL_DB.prepare(`INSERT INTO journal_entries(source_id,sequence,table_name,record_key,operation,before_json,after_json,recorded_at,fingerprint)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id,sequence) DO UPDATE SET fingerprint=excluded.fingerprint WHERE fingerprint!=excluded.fingerprint`)
      .bind(source.source_id, row.sequence, row.table_name, row.record_key, row.operation, row.before_json, row.after_json, row.recorded_at, await contentHash(row)))
    cursor = rows.results.at(-1)!.sequence
    statements.push(env.JOURNAL_DB.prepare(`INSERT INTO journal_checkpoints(source_id,sequence,updated_at) VALUES(?,?,?)
      ON CONFLICT(source_id) DO UPDATE SET sequence=MAX(sequence,excluded.sequence),updated_at=excluded.updated_at`)
      .bind(source.source_id, cursor, new Date().toISOString()))
    // A collision or failed copy rolls back the cursor and the whole page.
    await env.JOURNAL_DB.batch(statements)
  }
  return { sourceId: source.source_id, cursor }
}
