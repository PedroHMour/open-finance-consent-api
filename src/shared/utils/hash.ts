import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';

// Custo menor em teste para a suíte rodar rápido; 12 é o recomendado fora dele.
const BCRYPT_ROUNDS = env.NODE_ENV === 'test' ? 4 : 12;

export function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifySecret(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Hash determinístico de um objeto (chaves ordenadas), usado para comparar corpos de requisição. */
export function stableHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
