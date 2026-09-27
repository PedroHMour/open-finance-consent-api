import {
  bigint,
  bigserial,
  char,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Valores monetários são guardados em centavos (inteiro). Nunca usar float para dinheiro.
// mode 'number' é seguro até 2^53 centavos (~90 trilhões de reais).
const cents = (name: string) => bigint(name, { mode: 'number' });

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
};

export const accountTypeEnum = pgEnum('account_type', [
  'CONTA_DEPOSITO_A_VISTA',
  'CONTA_POUPANCA',
  'CONTA_PAGAMENTO_PRE_PAGA',
]);

export const creditDebitTypeEnum = pgEnum('credit_debit_type', ['CREDITO', 'DEBITO']);

export const transactionTypeEnum = pgEnum('transaction_type', [
  'PIX',
  'TED',
  'BOLETO',
  'CARTAO',
  'PACOTE_TARIFA_SERVICOS',
  'OUTROS',
]);

export const consentStatusEnum = pgEnum('consent_status', [
  'AWAITING_AUTHORISATION',
  'AUTHORISED',
  'REJECTED',
]);

export const rejectedByEnum = pgEnum('consent_rejected_by', ['USER', 'TPP', 'ASPSP']);

// CLIENT_REVOKED é um código próprio deste projeto (revogação pela receptora);
// os demais seguem os nomes usados no Open Finance Brasil.
export const rejectionReasonEnum = pgEnum('consent_rejection_reason', [
  'CUSTOMER_MANUALLY_REJECTED',
  'CUSTOMER_MANUALLY_REVOKED',
  'CLIENT_REVOKED',
  'CONSENT_EXPIRED',
  'CONSENT_MAX_DATE_REACHED',
]);

export const auditActorTypeEnum = pgEnum('audit_actor_type', ['CUSTOMER', 'CLIENT', 'SYSTEM']);
export const auditOutcomeEnum = pgEnum('audit_outcome', ['SUCCESS', 'DENIED']);

/** Titular dos dados: cliente pessoa física do banco (transmissor). */
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  cpf: char('cpf', { length: 11 }).notNull().unique(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  ...timestamps,
});

/** Instituição receptora (TPP) que solicita acesso aos dados. */
export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: varchar('client_id', { length: 64 }).notNull().unique(),
  clientSecretHash: text('client_secret_hash').notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  cnpj: char('cnpj', { length: 14 }).notNull(),
  ...timestamps,
});

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    brandName: varchar('brand_name', { length: 80 }).notNull(),
    branchCode: varchar('branch_code', { length: 4 }).notNull(),
    number: varchar('number', { length: 20 }).notNull(),
    checkDigit: varchar('check_digit', { length: 1 }).notNull(),
    type: accountTypeEnum('type').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('BRL'),
    availableAmountCents: cents('available_amount_cents').notNull().default(0),
    blockedAmountCents: cents('blocked_amount_cents').notNull().default(0),
    ...timestamps,
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('accounts_branch_number_unique').on(t.branchCode, t.number, t.checkDigit),
    index('accounts_customer_idx').on(t.customerId),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    type: transactionTypeEnum('type').notNull(),
    creditDebitType: creditDebitTypeEnum('credit_debit_type').notNull(),
    amountCents: cents('amount_cents').notNull(),
    description: varchar('description', { length: 140 }).notNull(),
    counterpartyName: varchar('counterparty_name', { length: 120 }),
    bookedAt: timestamp('booked_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index('transactions_account_booked_idx').on(t.accountId, t.bookedAt)],
);

export const consents = pgTable(
  'consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    /** CPF informado pela receptora (loggedUser). O vínculo com o cliente é confirmado na autorização. */
    customerCpf: char('customer_cpf', { length: 11 }).notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    status: consentStatusEnum('status').notNull().default('AWAITING_AUTHORISATION'),
    permissions: text('permissions').array().notNull(),
    expirationDateTime: timestamp('expiration_date_time', { withTimezone: true }).notNull(),
    statusUpdateDateTime: timestamp('status_update_date_time', { withTimezone: true })
      .notNull()
      .defaultNow(),
    rejectedBy: rejectedByEnum('rejected_by'),
    rejectionReason: rejectionReasonEnum('rejection_reason'),
    ...timestamps,
  },
  (t) => [
    index('consents_client_idx').on(t.clientId),
    index('consents_customer_cpf_idx').on(t.customerCpf),
  ],
);

export const consentAccounts = pgTable(
  'consent_accounts',
  {
    consentId: uuid('consent_id')
      .notNull()
      .references(() => consents.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.consentId, t.accountId] })],
);

/** Trilha de auditoria: toda mudança de consentimento e todo acesso a dados (concedido ou negado). */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    interactionId: uuid('interaction_id').notNull(),
    actorType: auditActorTypeEnum('actor_type').notNull(),
    actorId: varchar('actor_id', { length: 64 }).notNull(),
    action: varchar('action', { length: 64 }).notNull(),
    outcome: auditOutcomeEnum('outcome').notNull(),
    consentId: uuid('consent_id'),
    resourceType: varchar('resource_type', { length: 32 }),
    resourceId: varchar('resource_id', { length: 64 }),
    details: jsonb('details'),
    ip: varchar('ip', { length: 64 }),
  },
  (t) => [
    index('audit_logs_consent_idx').on(t.consentId),
    index('audit_logs_occurred_idx').on(t.occurredAt),
  ],
);

/** Garante que repetir a mesma requisição (mesma chave) não crie recursos duplicados. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 128 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.clientId, t.key] })],
);

export type Customer = typeof customers.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Consent = typeof consents.$inferSelect;
export type ConsentStatus = (typeof consentStatusEnum.enumValues)[number];
export type RejectedBy = (typeof rejectedByEnum.enumValues)[number];
export type RejectionReason = (typeof rejectionReasonEnum.enumValues)[number];
