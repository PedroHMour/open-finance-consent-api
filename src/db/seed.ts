import { eq } from 'drizzle-orm';
import { hashSecret } from '../shared/utils/hash.js';
import { db, pool } from './client.js';
import { accounts, clients, customers, transactions } from './schema.js';

/**
 * Dados de demonstração. Idempotente: se o cliente demo já existir, não faz nada.
 * Os CPFs abaixo são válidos pelo algoritmo, mas fictícios.
 */
const DEMO_CUSTOMER = {
  name: 'Maria Oliveira',
  cpf: '52998224725',
  email: 'maria.oliveira@example.com',
  password: 'Senha@123',
};

const DEMO_CLIENT = {
  clientId: 'fintech-exemplo',
  clientSecret: 'fintech-exemplo-secret',
  name: 'Fintech Exemplo S.A.',
  cnpj: '11222333000181',
};

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const existing = await db.query.customers.findFirst({
    where: eq(customers.cpf, DEMO_CUSTOMER.cpf),
  });
  if (existing) {
    console.log('Seed já aplicado anteriormente. Nada a fazer.');
    return;
  }

  await db.transaction(async (tx) => {
    const [customer] = await tx
      .insert(customers)
      .values({
        name: DEMO_CUSTOMER.name,
        cpf: DEMO_CUSTOMER.cpf,
        email: DEMO_CUSTOMER.email,
        passwordHash: await hashSecret(DEMO_CUSTOMER.password),
      })
      .returning();

    await tx.insert(clients).values({
      clientId: DEMO_CLIENT.clientId,
      clientSecretHash: await hashSecret(DEMO_CLIENT.clientSecret),
      name: DEMO_CLIENT.name,
      cnpj: DEMO_CLIENT.cnpj,
    });

    const [checking, savings] = await tx
      .insert(accounts)
      .values([
        {
          customerId: customer!.id,
          brandName: 'Banco Exemplo',
          branchCode: '0001',
          number: '1234567',
          checkDigit: '8',
          type: 'CONTA_DEPOSITO_A_VISTA',
          availableAmountCents: 523_475,
          blockedAmountCents: 10_000,
        },
        {
          customerId: customer!.id,
          brandName: 'Banco Exemplo',
          branchCode: '0001',
          number: '7654321',
          checkDigit: '0',
          type: 'CONTA_POUPANCA',
          availableAmountCents: 1_500_000,
        },
      ])
      .returning();

    const now = Date.now();
    await tx.insert(transactions).values([
      {
        accountId: checking!.id,
        type: 'TED',
        creditDebitType: 'CREDITO',
        amountCents: 650_000,
        description: 'Salário',
        counterpartyName: 'Empresa ABC Ltda',
        bookedAt: new Date(now - 25 * DAY),
      },
      {
        accountId: checking!.id,
        type: 'PIX',
        creditDebitType: 'DEBITO',
        amountCents: 18_990,
        description: 'Conta de energia',
        counterpartyName: 'Distribuidora de Energia',
        bookedAt: new Date(now - 20 * DAY),
      },
      {
        accountId: checking!.id,
        type: 'CARTAO',
        creditDebitType: 'DEBITO',
        amountCents: 32_745,
        description: 'Supermercado',
        bookedAt: new Date(now - 12 * DAY),
      },
      {
        accountId: checking!.id,
        type: 'BOLETO',
        creditDebitType: 'DEBITO',
        amountCents: 120_000,
        description: 'Aluguel',
        counterpartyName: 'Imobiliária Centro',
        bookedAt: new Date(now - 5 * DAY),
      },
      {
        accountId: checking!.id,
        type: 'PACOTE_TARIFA_SERVICOS',
        creditDebitType: 'DEBITO',
        amountCents: 2_490,
        description: 'Tarifa pacote de serviços',
        bookedAt: new Date(now - 1 * DAY),
      },
      {
        accountId: savings!.id,
        type: 'PIX',
        creditDebitType: 'CREDITO',
        amountCents: 50_000,
        description: 'Aplicação na poupança',
        bookedAt: new Date(now - 10 * DAY),
      },
    ]);
  });

  console.log('Seed aplicado com sucesso.');
  console.log(`Cliente (titular): CPF ${DEMO_CUSTOMER.cpf} / senha ${DEMO_CUSTOMER.password}`);
  console.log(
    `Instituição receptora: client_id ${DEMO_CLIENT.clientId} / client_secret ${DEMO_CLIENT.clientSecret}`,
  );
}

try {
  await main();
} catch (error) {
  console.error('Falha no seed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
