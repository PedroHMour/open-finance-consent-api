import { and, asc, count, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { accounts, transactions, type Account } from '../../db/schema.js';
import { forbidden } from '../../shared/errors/app-error.js';
import { toOffset } from '../../shared/http/pagination.js';
import type { ConsentContext } from '../../shared/types/express.js';

interface Page {
  page: number;
  pageSize: number;
}

/** Contas compartilhadas no consentimento (visão da receptora). */
export async function listConsentedAccounts(consent: ConsentContext, { page, pageSize }: Page) {
  if (consent.accountIds.length === 0) return { rows: [] as Account[], total: 0 };

  const where = and(
    inArray(accounts.id, consent.accountIds),
    eq(accounts.customerId, consent.customerId),
  );
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(accounts)
      .where(where)
      .orderBy(asc(accounts.createdAt), asc(accounts.id))
      .limit(toOffset(page, pageSize).limit)
      .offset(toOffset(page, pageSize).offset),
    db.select({ value: count() }).from(accounts).where(where),
  ]);
  return { rows, total: total?.value ?? 0 };
}

/**
 * Busca uma conta garantindo que ela está coberta pelo consentimento.
 * Conta fora do consentimento responde 403 sem consultar o banco:
 * assim não revelamos se o ID existe ou não.
 */
export async function getConsentedAccount(consent: ConsentContext, accountId: string) {
  if (!consent.accountIds.includes(accountId)) {
    throw forbidden(
      'ACCOUNT_NOT_COVERED_BY_CONSENT',
      'A conta não está incluída no consentimento.',
    );
  }
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, accountId), eq(accounts.customerId, consent.customerId)),
  });
  if (!account) {
    throw forbidden(
      'ACCOUNT_NOT_COVERED_BY_CONSENT',
      'A conta não está incluída no consentimento.',
    );
  }
  return account;
}

export async function listTransactions(
  accountId: string,
  range: { from: Date; toExclusive: Date },
  { page, pageSize }: Page,
) {
  const where = and(
    eq(transactions.accountId, accountId),
    gte(transactions.bookedAt, range.from),
    lt(transactions.bookedAt, range.toExclusive),
  );
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(where)
      .orderBy(desc(transactions.bookedAt), desc(transactions.id))
      .limit(toOffset(page, pageSize).limit)
      .offset(toOffset(page, pageSize).offset),
    db.select({ value: count() }).from(transactions).where(where),
  ]);
  return { rows, total: total?.value ?? 0 };
}

/** Contas do próprio titular (para ele escolher quais compartilhar). */
export function listCustomerAccounts(customerId: string) {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.customerId, customerId))
    .orderBy(asc(accounts.createdAt), asc(accounts.id));
}
