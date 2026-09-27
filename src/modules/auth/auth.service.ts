import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { clients, customers } from '../../db/schema.js';
import { hashSecret, verifySecret } from '../../shared/utils/hash.js';
import { signClientToken, signCustomerToken } from './token.js';

// Hash fixo usado quando o usuário não existe: a comparação leva o mesmo tempo
// e um atacante não descobre, pelo tempo de resposta, quais CPFs estão cadastrados.
const dummyHash = await hashSecret('dummy-password-for-timing');

export async function loginCustomer(cpf: string, password: string) {
  const customer = await db.query.customers.findFirst({ where: eq(customers.cpf, cpf) });
  const valid = await verifySecret(password, customer?.passwordHash ?? dummyHash);
  if (!customer || !valid) return null;

  return {
    accessToken: signCustomerToken(customer.id),
    tokenType: 'Bearer' as const,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  };
}

export async function issueClientToken(clientId: string, clientSecret: string) {
  const client = await db.query.clients.findFirst({ where: eq(clients.clientId, clientId) });
  const valid = await verifySecret(clientSecret, client?.clientSecretHash ?? dummyHash);
  if (!client || !valid) return null;

  return {
    access_token: signClientToken(client.id, client.clientId),
    token_type: 'Bearer' as const,
    expires_in: env.ACCESS_TOKEN_TTL_SECONDS,
  };
}
