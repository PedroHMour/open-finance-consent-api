import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client.js';

// A pasta drizzle/ fica na raiz do projeto, tanto rodando via tsx (src/db) quanto compilado (dist/db).
const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

try {
  await migrate(db, { migrationsFolder });
  console.log('Migrations aplicadas com sucesso.');
} catch (error) {
  console.error('Falha ao aplicar migrations:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
