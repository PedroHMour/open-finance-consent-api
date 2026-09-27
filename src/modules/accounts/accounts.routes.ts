import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { auditedAccess } from '../../shared/audit.js';
import { unprocessable } from '../../shared/errors/app-error.js';
import { paginated, single } from '../../shared/http/envelope.js';
import { paginationQuery } from '../../shared/http/pagination.js';
import { parse } from '../../shared/http/validate.js';
import { customerOf, requireClient, requireCustomer } from '../auth/auth.middleware.js';
import { requireConsent } from '../consents/consent-guard.js';
import { presentAccount, presentBalances, presentTransaction } from './accounts.presenter.js';
import * as service from './accounts.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TRANSACTION_WINDOW_DAYS = 90;

const accountIdParam = z.object({ accountId: z.uuid('accountId deve ser um UUID') });

function consentOf(req: Request) {
  // Garantido pelo requireConsent; a checagem protege contra uso fora da ordem certa.
  if (!req.consent) throw new Error('requireConsent não foi executado antes da rota.');
  return req.consent;
}

// ---------------------------------------------------------------------------
// Recursos (visão da receptora, exige consentimento)
// ---------------------------------------------------------------------------

export const resourcesRouter = Router();

resourcesRouter.get(
  '/resources',
  requireClient,
  requireConsent('RESOURCES_READ'),
  async (req, res) => {
    const consent = consentOf(req);
    const query = parse(paginationQuery, req.query);
    const { rows, total } = await auditedAccess(
      db,
      req,
      { action: 'DATA_ACCESS', consentId: consent.consentId, resourceType: 'RESOURCE_LIST' },
      () =>
        service.listConsentedAccounts(consent, { page: query.page, pageSize: query['page-size'] }),
    );
    res.json(
      paginated(
        req,
        rows.map((account) => ({ resourceId: account.id, type: 'ACCOUNT', status: 'AVAILABLE' })),
        { page: query.page, pageSize: query['page-size'], totalRecords: total },
      ),
    );
  },
);

// ---------------------------------------------------------------------------
// Contas (visão da receptora, exige consentimento)
// ---------------------------------------------------------------------------

export const accountsRouter = Router();

accountsRouter.get(
  '/accounts',
  requireClient,
  requireConsent('ACCOUNTS_READ'),
  async (req, res) => {
    const consent = consentOf(req);
    const query = parse(paginationQuery, req.query);
    const { rows, total } = await auditedAccess(
      db,
      req,
      { action: 'DATA_ACCESS', consentId: consent.consentId, resourceType: 'ACCOUNT_LIST' },
      () =>
        service.listConsentedAccounts(consent, { page: query.page, pageSize: query['page-size'] }),
    );
    res.json(
      paginated(req, rows.map(presentAccount), {
        page: query.page,
        pageSize: query['page-size'],
        totalRecords: total,
      }),
    );
  },
);

accountsRouter.get(
  '/accounts/:accountId',
  requireClient,
  requireConsent('ACCOUNTS_READ'),
  async (req, res) => {
    const consent = consentOf(req);
    const { accountId } = parse(accountIdParam, req.params);
    const account = await auditedAccess(
      db,
      req,
      {
        action: 'DATA_ACCESS',
        consentId: consent.consentId,
        resourceType: 'ACCOUNT',
        resourceId: accountId,
      },
      () => service.getConsentedAccount(consent, accountId),
    );
    res.json(single(req, presentAccount(account)));
  },
);

accountsRouter.get(
  '/accounts/:accountId/balances',
  requireClient,
  requireConsent('ACCOUNTS_BALANCES_READ'),
  async (req, res) => {
    const consent = consentOf(req);
    const { accountId } = parse(accountIdParam, req.params);
    const account = await auditedAccess(
      db,
      req,
      {
        action: 'DATA_ACCESS',
        consentId: consent.consentId,
        resourceType: 'ACCOUNT_BALANCES',
        resourceId: accountId,
      },
      () => service.getConsentedAccount(consent, accountId),
    );
    res.json(single(req, presentBalances(account)));
  },
);

const transactionsQuery = paginationQuery.extend({
  fromBookingDate: z.iso.date().optional(),
  toBookingDate: z.iso.date().optional(),
});

accountsRouter.get(
  '/accounts/:accountId/transactions',
  requireClient,
  requireConsent('ACCOUNTS_TRANSACTIONS_READ'),
  async (req, res) => {
    const consent = consentOf(req);
    const { accountId } = parse(accountIdParam, req.params);
    const query = parse(transactionsQuery, req.query);

    // Datas em UTC. Sem filtro, usa os últimos 90 dias.
    const today = new Date().toISOString().slice(0, 10);
    const toDate = query.toBookingDate ?? today;
    const fromDate =
      query.fromBookingDate ??
      new Date(Date.parse(toDate) - DEFAULT_TRANSACTION_WINDOW_DAYS * DAY_MS)
        .toISOString()
        .slice(0, 10);
    if (fromDate > toDate) {
      throw unprocessable(
        'INVALID_DATE_RANGE',
        'fromBookingDate deve ser menor ou igual a toBookingDate.',
      );
    }
    const range = {
      from: new Date(`${fromDate}T00:00:00.000Z`),
      toExclusive: new Date(Date.parse(`${toDate}T00:00:00.000Z`) + DAY_MS),
    };

    const { account, rows, total } = await auditedAccess(
      db,
      req,
      {
        action: 'DATA_ACCESS',
        consentId: consent.consentId,
        resourceType: 'ACCOUNT_TRANSACTIONS',
        resourceId: accountId,
        details: { fromDate, toDate },
      },
      async () => {
        const account = await service.getConsentedAccount(consent, accountId);
        const page = await service.listTransactions(accountId, range, {
          page: query.page,
          pageSize: query['page-size'],
        });
        return { account, ...page };
      },
    );

    res.json(
      paginated(
        req,
        rows.map((t) => presentTransaction(t, account.currency)),
        { page: query.page, pageSize: query['page-size'], totalRecords: total },
      ),
    );
  },
);

// ---------------------------------------------------------------------------
// Contas do próprio titular
// ---------------------------------------------------------------------------

export const customerAccountsRouter = Router();

customerAccountsRouter.get('/accounts', requireCustomer, async (req, res) => {
  const rows = await service.listCustomerAccounts(customerOf(req).customerId);
  res.json(
    paginated(
      req,
      rows.map((account) => ({ ...presentAccount(account), balances: presentBalances(account) })),
      { page: 1, pageSize: Math.max(rows.length, 1), totalRecords: rows.length },
    ),
  );
});
