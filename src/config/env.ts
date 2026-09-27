import { existsSync } from 'node:fs';
import { z } from 'zod';

// Carrega o .env local, se existir. Em produção as variáveis vêm do ambiente
// e nos testes vêm do vitest.config.ts (para nunca apontar para o banco de desenvolvimento).
if (process.env.NODE_ENV !== 'test' && existsSync('.env')) {
  process.loadEnvFile('.env');
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter no mínimo 32 caracteres'),
  JWT_ISSUER: z.string().default('open-finance-consent-api'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  CONSENT_MAX_DAYS: z.coerce.number().int().positive().default(365),
  // Quantos proxies confiáveis existem na frente da API (0 = nenhum).
  // Necessário para o rate limit e a auditoria enxergarem o IP real do cliente.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

/** Valor do .env.example. Serve para a demonstração, nunca para um ambiente real. */
export const EXAMPLE_JWT_SECRET = 'troque-por-um-segredo-com-no-minimo-32-caracteres';

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Falha rápida: sem configuração válida a API não deve subir.
  console.error('Variáveis de ambiente inválidas:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
