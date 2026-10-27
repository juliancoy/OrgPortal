import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
export class FullSchemaDb {
  sql = new DatabaseSync(':memory:');
  constructor() {
    this.sql.exec('PRAGMA foreign_keys=ON');
    const dir = new URL('../../migrations/', import.meta.url);
    for (const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort()) this.sql.exec(readFileSync(new URL(name,dir),'utf8'));
  }
  prepare(sql:string) {
    const stmt=this.sql.prepare(sql);
    const bound=(values:unknown[]=[])=>({bind:(...v:unknown[])=>bound(v),first:async<T>()=>(stmt.get(...values as [])||null) as T|null,all:async<T>()=>({results:stmt.all(...values as []) as T[]}),run:async()=>({meta:{changes:Number(stmt.run(...values as []).changes)}})});
    return bound();
  }
  async batch(statements:{run:()=>Promise<unknown>}[]) {
    this.sql.exec('BEGIN');
    try { const out=[];for(const stmt of statements)out.push(await stmt.run());this.sql.exec('COMMIT');return out; }
    catch(error) {this.sql.exec('ROLLBACK');throw error;}
  }
  asD1() {return this as unknown as D1Database;}
}
