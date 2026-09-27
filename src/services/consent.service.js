const prisma = require('../config/database');
const AppError = require('../utils/AppError');

const VALID_PERMISSIONS = [
  'ACCOUNTS_READ',
  'ACCOUNTS_BALANCES_READ',
  'ACCOUNTS_TRANSACTIONS_READ',
  'CUSTOMERS_PERSONAL_IDENTIFICATIONS_READ',
];

const createConsent = async ({ userId, clientId, clientName, permissions, accountIds, expiresAt }) => {
  const invalidPermissions = permissions.filter((p) => !VALID_PERMISSIONS.includes(p));
  if (invalidPermissions.length > 0) {
    throw new AppError(`Permissões inválidas: ${invalidPermissions.join(', ')}`, 400, 'INVALID_PERMISSIONS');
  }

  if (accountIds && accountIds.length > 0) {
    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds }, userId },
    });
    if (accounts.length !== accountIds.length) {
      throw new AppError('Uma ou mais contas não pertencem ao usuário', 403, 'FORBIDDEN_ACCOUNTS');
    }
  }

  const expiry = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  if (expiry <= new Date()) {
    throw new AppError('A data de expiração deve ser futura', 400, 'INVALID_EXPIRY');
  }

  const consent = await prisma.consent.create({
    data: {
      userId,
      clientId,
      clientName,
      permissions,
      expiresAt: expiry,
      status: 'AWAITING_AUTHORISATION',
      accounts: accountIds
        ? { create: accountIds.map((accountId) => ({ accountId })) }
        : undefined,
    },
    include: {
      accounts: { include: { account: { select: { id: true, accountNumber: true, type: true } } } },
    },
  });

  return formatConsent(consent);
};

const authorizeConsent = async ({ consentId, userId }) => {
  const consent = await findConsentOrFail(consentId, userId);

  if (consent.status !== 'AWAITING_AUTHORISATION') {
    throw new AppError(`Consentimento não pode ser autorizado. Status atual: ${consent.status}`, 422, 'INVALID_STATUS');
  }

  const updated = await prisma.consent.update({
    where: { id: consentId },
    data: { status: 'AUTHORISED' },
    include: {
      accounts: { include: { account: { select: { id: true, accountNumber: true, type: true } } } },
    },
  });

  return formatConsent(updated);
};

const revokeConsent = async ({ consentId, userId, revokedBy }) => {
  const consent = await findConsentOrFail(consentId, userId);

  if (['REVOKED', 'EXPIRED', 'REJECTED'].includes(consent.status)) {
    throw new AppError(`Consentimento já está ${consent.status}`, 422, 'INVALID_STATUS');
  }

  const updated = await prisma.consent.update({
    where: { id: consentId },
    data: { status: 'REVOKED', revokedAt: new Date(), revokedBy },
    include: {
      accounts: { include: { account: { select: { id: true, accountNumber: true, type: true } } } },
    },
  });

  return formatConsent(updated);
};

const getConsentById = async ({ consentId, userId }) => {
  const consent = await findConsentOrFail(consentId, userId);
  return formatConsent(consent);
};

const listConsents = async ({ userId, status, page = 1, limit = 10 }) => {
  const skip = (page - 1) * limit;

  const where = {
    userId,
    ...(status && { status }),
  };

  const [consents, total] = await Promise.all([
    prisma.consent.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        accounts: { include: { account: { select: { id: true, accountNumber: true, type: true } } } },
      },
    }),
    prisma.consent.count({ where }),
  ]);

  return {
    data: consents.map(formatConsent),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// Helpers
const findConsentOrFail = async (consentId, userId) => {
  const consent = await prisma.consent.findFirst({
    where: { id: consentId, userId },
    include: {
      accounts: { include: { account: { select: { id: true, accountNumber: true, type: true } } } },
    },
  });

  if (!consent) {
    throw new AppError('Consentimento não encontrado', 404, 'CONSENT_NOT_FOUND');
  }

  return consent;
};

const formatConsent = (consent) => ({
  id: consent.id,
  clientId: consent.clientId,
  clientName: consent.clientName,
  status: consent.status,
  permissions: consent.permissions,
  expiresAt: consent.expiresAt,
  createdAt: consent.createdAt,
  updatedAt: consent.updatedAt,
  revokedAt: consent.revokedAt || undefined,
  accounts: consent.accounts.map((ca) => ca.account),
});

module.exports = { createConsent, authorizeConsent, revokeConsent, getConsentById, listConsents };
