import type { MiddlewareHandler } from 'hono';

type Cost = { queries: number; rows_read: number; rows_written: number; unmeasured_queries: number; db_ms: number };
/** Request-local accounting; never retain SQL, bindings, result rows, or identities. */
export function measuredDatabase(database: D1Database) {
  const cost: Cost = { queries: 0, rows_read: 0, rows_written: 0, unmeasured_queries: 0, db_ms: 0 };
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  function record(result: D1Result) {
    const meta = result.meta;
    if (typeof meta?.rows_read === 'number' && typeof meta?.rows_written === 'number') {
      cost.rows_read += meta.rows_read;
      cost.rows_written += meta.rows_written;
    } else cost.unmeasured_queries++;
  }
  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    const proxy = new Proxy(statement, {
      get(target, key) {
        if (key === 'bind') return (...values: unknown[]) => wrap(target.bind(...values));
        if (key === 'all' || key === 'run' || key === 'first') return async (column?: string) => {
          const started = performance.now();
          cost.queries++;
          let received = false;
          try {
            // first() omits billing metadata; all() executes the same query once.
            const result = key === 'run' ? await target.run() : await target.all<Record<string, unknown>>();
            received = true;
            record(result);
            if (key !== 'first') return result;
            const row = result.results?.[0];
            if (!row) return null;
            if (column === undefined) return row;
            if (!(column in row)) throw new Error('D1 column not found');
            return row[column];
          } catch (error) {
            if (!received) cost.unmeasured_queries++;
            throw error;
          } finally { cost.db_ms += performance.now() - started; }
        };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    originals.set(proxy, statement);
    return proxy;
  }
  const db = new Proxy(database, {
    get(target, key) {
      if (key === 'prepare') return (sql: string) => wrap(target.prepare(sql));
      if (key === 'batch') return async (statements: D1PreparedStatement[]) => {
        cost.queries += statements.length;
        const started = performance.now();
        try {
          const results = await target.batch(statements.map(statement => originals.get(statement) || statement));
          results.forEach(record);
          return results;
        } catch (error) {
          cost.unmeasured_queries += statements.length;
          throw error;
        } finally { cost.db_ms += performance.now() - started; }
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { db, cost };
}

export function databaseCostMetrics(sample = () => Math.random() < 0.01): MiddlewareHandler<{ Bindings: { DB: D1Database } }> {
  return async (c, next) => {
    if (c.req.method !== 'GET') return next();
    const { db, cost } = measuredDatabase(c.env.DB);
    // Do not replace a binding on the shared environment object.
    c.env = { ...c.env, DB: db };
    await next();
    c.header('Server-Timing', `d1;dur=${cost.db_ms.toFixed(2)};desc="queries=${cost.queries} rows_read=${cost.rows_read} rows_written=${cost.rows_written} unmeasured=${cost.unmeasured_queries}"`, { append: true });
    if (sample()) console.info(JSON.stringify({ event: 'database.cost', route: c.req.path, status: c.res.status, ...cost }));
  };
}
