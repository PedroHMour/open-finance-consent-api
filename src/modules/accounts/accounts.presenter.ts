import type { Account, Transaction } from '../../db/schema.js';
import { toAmount } from '../../shared/utils/money.js';

export function presentAccount(account: Account) {
  return {
    accountId: account.id,
    brandName: account.brandName,
    type: account.type,
    branchCode: account.branchCode,
    number: account.number,
    checkDigit: account.checkDigit,
    currency: account.currency,
  };
}

export function presentBalances(account: Account) {
  return {
    availableAmount: toAmount(account.availableAmountCents, account.currency),
    blockedAmount: toAmount(account.blockedAmountCents, account.currency),
    updateDateTime: account.updatedAt.toISOString(),
  };
}

export function presentTransaction(transaction: Transaction, currency: string) {
  return {
    transactionId: transaction.id,
    type: transaction.type,
    creditDebitType: transaction.creditDebitType,
    transactionName: transaction.description,
    counterpartyName: transaction.counterpartyName,
    transactionAmount: toAmount(transaction.amountCents, currency),
    transactionDateTime: transaction.bookedAt.toISOString(),
  };
}
