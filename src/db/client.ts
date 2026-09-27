import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema.js';

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

export const db = drizzle(pool, { schema, casing: 'snake_case' });

export type Db = typeof db;
/** Aceita tanto a conexão principal quanto uma transação aberta. */
export type DbExecutor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
