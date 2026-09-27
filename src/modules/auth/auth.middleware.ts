import type { Request, RequestHandler } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { clients, customers } from '../../db/schema.js';
import { forbidden, unauthorized } from '../../shared/errors/app-error.js';
import { verifyAccessToken } from './token.js';

function bearerToken(req: Request): string {
  const header = req.get('authorization');
  const [scheme, token] = header?.split(' ') ?? [];
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw unauthorized('Envie o header Authorization: Bearer <token>.');
  }
  return token;
}

/**
 * Exige token de titular (cliente do banco).
 * O titular é carregado do banco pelo "sub": um token de alguém que não existe mais é recusado,
 * e o CPF usado nas regras vem do cadastro, não do token.
 */
export const requireCustomer: RequestHandler = async (req, _res, next) => {
  const claims = verifyAccessToken(bearerToken(req));
  if (claims.typ !== 'customer') {
    throw forbidden('WRONG_TOKEN_TYPE', 'Este endpoint exige um token de titular.');
  }

  const customer = await db.query.customers.findFirst({
    columns: { id: true, cpf: true },
    where: eq(customers.id, claims.sub),
  });
  if (!customer) throw unauthorized('Titular do token não encontrado.');

  req.auth = { type: 'CUSTOMER', customerId: customer.id, cpf: customer.cpf };
  next();
};

/** Exige token de instituição receptora (obtido via client_credentials). */
export const requireClient: RequestHandler = async (req, _res, next) => {
  const claims = verifyAccessToken(bearerToken(req));
  if (claims.typ !== 'client') {
    throw forbidden('WRONG_TOKEN_TYPE', 'Este endpoint exige um token de instituição receptora.');
  }

  const client = await db.query.clients.findFirst({
    columns: { id: true, clientId: true },
    where: eq(clients.id, claims.sub),
  });
  if (!client) throw unauthorized('Instituição receptora do token não encontrada.');

  req.auth = { type: 'CLIENT', clientUuid: client.id, clientId: client.clientId };
  next();
};

export function customerOf(req: Request) {
  if (req.auth?.type !== 'CUSTOMER') throw unauthorized();
  return req.auth;
}

export function clientOf(req: Request) {
  if (req.auth?.type !== 'CLIENT') throw unauthorized();
  return req.auth;
}
