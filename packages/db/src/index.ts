/**
 * @era/db — database access layer (placeholder).
 *
 * The real Drizzle client, schema, and migrations land in the Phase 1
 * build-out. For now this exports typed stubs so downstream packages can
 * depend on a stable surface without a live connection.
 */

export interface DbConfig {
  readonly connectionString: string;
  readonly maxConnections: number;
  readonly ssl: boolean;
}

export interface DbClientPlaceholder {
  readonly config: DbConfig;
  readonly isReady: boolean;
}

const defaultConfig: DbConfig = {
  connectionString: '',
  maxConnections: 10,
  ssl: true,
};

/**
 * Return a typed database stub. Replaced by the real Drizzle client in Phase 1.
 */
export function createDbPlaceholder(config: Partial<DbConfig> = {}): DbClientPlaceholder {
  return {
    config: { ...defaultConfig, ...config },
    isReady: false,
  };
}
