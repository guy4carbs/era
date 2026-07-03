/**
 * Drizzle client backed by the Neon serverless HTTP driver.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import * as schema from './schema/index.ts';

function connect(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type DbClient = ReturnType<typeof connect>;

/**
 * Create a Drizzle client bound to a Neon database URL, with the full schema
 * attached so the query builder and relational queries are fully typed.
 *
 * The underlying Neon client is constructed lazily on first use rather than at
 * call time. Route and lib modules create a client at import (`const db =
 * createDbClient(process.env.DATABASE_URL!)`), and `next build` evaluates those
 * modules while collecting page data — so eager construction would require a
 * live DATABASE_URL just to build. Deferring keeps import side-effect free; the
 * URL is still resolved and validated the first time a query actually runs.
 */
export function createDbClient(databaseUrl: string): DbClient {
  let client: DbClient | undefined;
  const resolve = (): DbClient => (client ??= connect(databaseUrl));

  return new Proxy({} as DbClient, {
    get(_target, property) {
      const target = resolve();
      const value = Reflect.get(target, property) as unknown;
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}
