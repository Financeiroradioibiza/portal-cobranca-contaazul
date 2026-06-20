import pg from 'pg';

let pool: pg.Pool | null = null;

/** Pool Neon (portal) — distinto do Postgres local do gateway. */
export function getPortalPool(): pg.Pool {
  if (!pool) {
    const url = process.env.PORTAL_DATABASE_URL ?? process.env.NEON_DATABASE_URL ?? '';
    if (!url) {
      throw new Error('PORTAL_DATABASE_URL não definida');
    }
    pool = new pg.Pool({ connectionString: url, max: 8 });
  }
  return pool;
}

export async function portalQuery<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPortalPool().query<T>(text, params);
}

export async function closePortalPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
