import { Pool } from 'pg';

const TEST_DB_PORT = 5433;

const DB_NAMES: Record<string, string> = {
  user: 'user_test',
  catalogue: 'catalogue_test',
  auction: 'auction_test',
  payment: 'payment_test',
  shipping: 'shipping_test',
  notification: 'notification_test',
};

const pools = new Map<string, Pool>();

export type ServiceName =
  | 'user'
  | 'catalogue'
  | 'auction'
  | 'payment'
  | 'shipping'
  | 'notification';

/** Returns a cached pg.Pool for the given service's test database. */
export function getDb(service: ServiceName): Pool {
  if (!pools.has(service)) {
    pools.set(
      service,
      new Pool({
        host: 'localhost',
        port: TEST_DB_PORT,
        user: 'carat',
        password: 'carat_test',
        database: DB_NAMES[service],
      }),
    );
  }
  return pools.get(service)!;
}

/**
 * Truncates all non-migration tables in the service's database.
 * Call in beforeEach to start each flow from a clean state.
 */
export async function resetDb(service: ServiceName): Promise<void> {
  const pool = getDb(service);
  const { rows } = await pool.query<{ tablename: string }>(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  `);
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

/** Close all pools — call once after all tests finish. */
export async function closeAllPools(): Promise<void> {
  for (const pool of pools.values()) {
    await pool.end();
  }
  pools.clear();
}
