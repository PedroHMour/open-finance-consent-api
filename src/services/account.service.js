const prisma = require('../config/database');
const AppError = require('../utils/AppError');

const listAccounts = async ({ userId, page = 1, limit = 10 }) => {
  const skip = (page - 1) * limit;

  const [accounts, total] = await Promise.all([
    prisma.account.findMany({
      where: { userId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        accountNumber: true,
        agency: true,
        type: true,
        balance: true,
        currency: true,
        createdAt: true,
      },
    }),
    prisma.account.count({ where: { userId } }),
  ]);

  return {
    data: accounts,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getAccountBalance = async ({ accountId, userId, consentId }) => {
  await validateConsentPermission(userId, consentId, 'ACCOUNTS_BALANCES_READ', accountId);

  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true, accountNumber: true, agency: true, type: true, balance: true, currency: true, updatedAt: true },
  });

  if (!account) throw new AppError('Conta não encontrada', 404, 'ACCOUNT_NOT_FOUND');

  return {
    accountId: account.id,
    accountNumber: account.accountNumber,
    availableAmount: account.balance,
    blockedAmount: 0,
    currency: account.currency,
    lastUpdatedAt: account.updatedAt,
  };
};

const getAccountTransactions = async ({ accountId, userId, consentId, page = 1, limit = 20, fromDate, toDate }) => {
  await validateConsentPermission(userId, consentId, 'ACCOUNTS_TRANSACTIONS_READ', accountId);

  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new AppError('Conta não encontrada', 404, 'ACCOUNT_NOT_FOUND');

  const skip = (page - 1) * limit;

  const where = {
    accountId,
    ...(fromDate || toDate
      ? {
          transactedAt: {
            ...(fromDate && { gte: new Date(fromDate) }),
            ...(toDate && { lte: new Date(toDate) }),
          },
        }
      : {}),
  };

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { transactedAt: 'desc' },
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    data: transactions,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// Valida se o consentimento está ativo, tem a permissão e cobre a conta
const validateConsentPermission = async (userId, consentId, permission, accountId) => {
  if (!consentId) throw new AppError('Consentimento obrigatório para acessar este recurso', 400, 'CONSENT_REQUIRED');

  const consent = await prisma.consent.findFirst({
    where: { id: consentId, userId, status: 'AUTHORISED' },
    include: { accounts: true },
  });

  if (!consent) throw new AppError('Consentimento não encontrado ou não autorizado', 403, 'CONSENT_INVALID');

  if (new Date() > consent.expiresAt) {
    await prisma.consent.update({ where: { id: consentId }, data: { status: 'EXPIRED' } });
    throw new AppError('Consentimento expirado', 403, 'CONSENT_EXPIRED');
  }

  if (!consent.permissions.includes(permission)) {
    throw new AppError(`Permissão '${permission}' não concedida neste consentimento`, 403, 'PERMISSION_DENIED');
  }

  if (accountId) {
    const accountInConsent = consent.accounts.some((ca) => ca.accountId === accountId);
    if (!accountInConsent) {
      throw new AppError('Esta conta não está incluída no consentimento', 403, 'ACCOUNT_NOT_IN_CONSENT');
    }
  }
};

module.exports = { listAccounts, getAccountBalance, getAccountTransactions };
