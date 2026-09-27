import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/**
 * Roda uma vez antes da suíte: garante que o banco de TESTE existe, recria o schema
 * e aplica as migrations. Testa, portanto, as próprias migrations que vão para produção.
 */
export default async function setup() {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    'postgresql://openfinance:openfinance@localhost:5433/openfinance_test';

  const url = new URL(connectionString);
  const databaseName = url.pathname.slice(1);
  if (!/test/i.test(databaseName)) {
    throw new Error(`Recusando limpar um banco que não parece de teste: ${databaseName}`);
  }

  await createDatabaseIfMissing(url, databaseName);

  const pool = new pg.Pool({ connectionString });
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE;');
    await migrate(drizzle(pool), { migrationsFolder: path.resolve('drizzle') });
  } finally {
    await pool.end();
  }
}

/** Conecta no banco de manutenção "postgres" e cria o banco de teste se ele não existir. */
async function createDatabaseIfMissing(url: URL, databaseName: string) {
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);
    if (rowCount === 0) {
      await admin.query(`CREATE DATABASE ${pg.escapeIdentifier(databaseName)}`);
    }
  } finally {
    await admin.end();
  }
}
