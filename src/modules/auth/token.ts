import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { unauthorized } from '../../shared/errors/app-error.js';

const ALGORITHM = 'HS256';

// O token carrega só identificadores. Dados pessoais (como o CPF) não vão no JWT,
// que é apenas codificado em base64 e pode ser lido por quem o tiver em mãos.
const claimsSchema = z.discriminatedUnion('typ', [
  z.object({ typ: z.literal('customer'), sub: z.uuid() }),
  z.object({ typ: z.literal('client'), sub: z.uuid(), client_id: z.string() }),
]);

export type TokenClaims = z.infer<typeof claimsSchema>;

function sign(
  claims: { typ: 'customer' } | { typ: 'client'; client_id: string },
  subject: string,
): string {
  return jwt.sign(claims, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    issuer: env.JWT_ISSUER,
    subject,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function signCustomerToken(customerId: string): string {
  return sign({ typ: 'customer' }, customerId);
}

export function signClientToken(clientUuid: string, clientId: string): string {
  return sign({ typ: 'client', client_id: clientId }, clientUuid);
}

export function verifyAccessToken(token: string): TokenClaims {
  let payload: unknown;
  try {
    // Fixar o algoritmo impede ataques de troca de algoritmo (ex.: "alg: none").
    payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ALGORITHM],
      issuer: env.JWT_ISSUER,
    });
  } catch {
    throw unauthorized('Token de acesso inválido ou expirado.');
  }

  const claims = claimsSchema.safeParse(payload);
  if (!claims.success) throw unauthorized('Token de acesso com formato inesperado.');
  return claims.data;
}
