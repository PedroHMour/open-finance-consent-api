import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../../config/env.js';
import { errorBody } from '../http/envelope.js';
import { normalizeCpf } from '../utils/cpf.js';

const skip = () => env.NODE_ENV === 'test';

const tooManyRequests = errorBody([
  {
    code: 'TOO_MANY_REQUESTS',
    title: 'Muitas requisições',
    detail: 'Limite de requisições excedido. Tente novamente mais tarde.',
  },
]);

const common = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  message: tooManyRequests,
} as const;

const ipKey = (req: Request) => `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;

/** Limite geral por IP. */
export const globalRateLimit = rateLimit({ ...common, windowMs: 60 * 1000, limit: 300 });

/**
 * Login do titular: limite por CPF, contra força bruta numa conta específica.
 * Contar por CPF (e não por IP) evita que várias pessoas atrás do mesmo IP se bloqueiem.
 */
export const loginRateLimit = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => {
    const body = req.body as { cpf?: unknown } | undefined;
    const cpf = typeof body?.cpf === 'string' ? normalizeCpf(body.cpf) : '';
    return cpf ? `login:${cpf}` : ipKey(req);
  },
});

/** Token da receptora: limite separado, por IP. */
export const tokenRateLimit = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: ipKey,
});
