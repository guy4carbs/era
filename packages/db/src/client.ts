/**
 * Drizzle client backed by the Neon serverless HTTP driver.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import * as schema from './schema/index.ts';

/**
 * Create a Drizzle client bound to a Neon database URL, with the full schema
 * attached so the query builder and relational queries are fully typed.
 */
export function createDbClient(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type DbClient = ReturnType<typeof createDbClient>;
