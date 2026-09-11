import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';

class SqliteStatement {
  constructor(private statement: StatementSync, private parameters: SQLInputValue[] = []) {}
  bind(...parameters: SQLInputValue[]) { return new SqliteStatement(this.statement, parameters); }
  async first<T>() { return (this.statement.get(...this.parameters) as T | undefined) ?? null; }
  async all<T>() { return { success: true, results: this.statement.all(...this.parameters) as T[], meta: { changes: 0 } }; }
  async run() {
    const result = this.statement.run(...this.parameters);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
  async execute() { return this.statement.columns().length ? this.all() : this.run(); }
}

export class TimebankDatabase {
  readonly sqlite = new DatabaseSync(':memory:');
  constructor() {
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    this.sqlite.exec(readFileSync(new URL('../../migrations/0001_contact_pages.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../../migrations/0004_ledger_ubi.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../../migrations/0006_connections_notifications.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../../migrations/0020_timebank.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../../migrations/0021_timebank_communities_images.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../../migrations/0022_timebank_uptake.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../../migrations/0023_timebank_notifications.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../../migrations/0024_timebank_listing_visibility.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../../migrations/0025_timebank_import_claims.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../../migrations/0026_timebank_listing_votes.sql', import.meta.url), 'utf8'));
  }
  prepare(sql: string) { return new SqliteStatement(this.sqlite.prepare(sql)); }
  async batch(statements: SqliteStatement[]) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.execute());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  asD1() { return this as unknown as D1Database; }
}
