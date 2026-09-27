import { sql } from 'drizzle-orm';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { accounts, clients, customers, transactions } from '../../src/db/schema.js';
import { hashSecret } from '../../src/shared/utils/hash.js';

export const app = createApp();

/** Limpa todas as tabelas entre os testes. */
export async function resetDb() {
  await db.execute(sql`
    TRUNCATE audit_logs, idempotency_keys, consent_accounts, consents,
             transactions, accounts, clients, customers
    RESTART IDENTITY CASCADE
  `);
}

// CPFs válidos (fictícios) para os testes.
export const CPF_MARIA = '52998224725';
export const CPF_JOAO = '11144477735';
export const PASSWORD = 'Senha@123';

export async function createCustomer(cpf: string, name = 'Cliente Teste') {
  const [customer] = await db
    .insert(customers)
    .values({ name, cpf, email: `${cpf}@example.com`, passwordHash: await hashSecret(PASSWORD) })
    .returning();
  return customer!;
}

export async function createClient(clientId: string, secret = `${clientId}-secret`) {
  const [client] = await db
    .insert(clients)
    .values({
      clientId,
      clientSecretHash: await hashSecret(secret),
      name: `Receptora ${clientId}`,
      cnpj: '11222333000181',
    })
    .returning();
  return { client: client!, secret };
}

let accountSeq = 0;
export async function createAccount(
  customerId: string,
  overrides: Partial<typeof accounts.$inferInsert> = {},
) {
  accountSeq += 1;
  const [account] = await db
    .insert(accounts)
    .values({
      customerId,
      brandName: 'Banco Teste',
      branchCode: '0001',
      number: String(1000000 + accountSeq),
      checkDigit: '1',
      type: 'CONTA_DEPOSITO_A_VISTA',
      availableAmountCents: 100_050,
      blockedAmountCents: 2_000,
      ...overrides,
    })
    .returning();
  return account!;
}

export async function createTransaction(
  accountId: string,
  bookedAt: string,
  overrides: Partial<typeof transactions.$inferInsert> = {},
) {
  const [transaction] = await db
    .insert(transactions)
    .values({
      accountId,
      type: 'PIX',
      creditDebitType: 'DEBITO',
      amountCents: 1_990,
      description: 'Compra',
      bookedAt: new Date(bookedAt),
      ...overrides,
    })
    .returning();
  return transaction!;
}

export async function clientToken(clientId: string, secret: string): Promise<string> {
  const res = await request(app)
    .post('/oauth/token')
    .type('form')
    .send({ grant_type: 'client_credentials', client_id: clientId, client_secret: secret })
    .expect(200);
  return res.body.access_token as string;
}

export async function customerToken(cpf: string): Promise<string> {
  const res = await request(app)
    .post('/customer/login')
    .send({ cpf, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

export const ALL_PERMISSIONS = [
  'ACCOUNTS_READ',
  'ACCOUNTS_BALANCES_READ',
  'ACCOUNTS_TRANSACTIONS_READ',
  'RESOURCES_READ',
];

export function consentBody(
  cpf: string,
  permissions = ALL_PERMISSIONS,
  expirationDateTime?: string,
) {
  return {
    data: {
      loggedUser: { document: { identification: cpf, rel: 'CPF' } },
      permissions,
      ...(expirationDateTime && { expirationDateTime }),
    },
  };
}

let keySeq = 0;
export async function createConsent(token: string, body: ReturnType<typeof consentBody>) {
  keySeq += 1;
  const res = await request(app)
    .post('/open-banking/consents/v1/consents')
    .set('Authorization', `Bearer ${token}`)
    .set('x-idempotency-key', `key-${keySeq}-${Date.now()}`)
    .send(body)
    .expect(201);
  return res.body.data.consentId as string;
}

export function authorise(token: string, consentId: string, accountIds: string[]) {
  return request(app)
    .post(`/customer/consents/${consentId}/authorise`)
    .set('Authorization', `Bearer ${token}`)
    .send({ accountIds });
}

/**
 * Cenário completo: Maria com duas contas, receptora "fintech-a" e um consentimento
 * autorizado cobrindo só a primeira conta.
 */
export async function authorisedScenario(permissions = ALL_PERMISSIONS) {
  const maria = await createCustomer(CPF_MARIA, 'Maria');
  const shared = await createAccount(maria.id);
  const notShared = await createAccount(maria.id, { type: 'CONTA_POUPANCA' });
  const { client, secret } = await createClient('fintech-a');

  const tppToken = await clientToken(client.clientId, secret);
  const mariaToken = await customerToken(CPF_MARIA);
  const consentId = await createConsent(tppToken, consentBody(CPF_MARIA, permissions));
  await authorise(mariaToken, consentId, [shared.id]).expect(200);

  return { maria, shared, notShared, client, tppToken, mariaToken, consentId };
}
