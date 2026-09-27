import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { consentStatusEnum } from '../../db/schema.js';
import { badRequest, unprocessable } from '../../shared/errors/app-error.js';
import { single } from '../../shared/http/envelope.js';
import { paginationQuery } from '../../shared/http/pagination.js';
import { parse } from '../../shared/http/validate.js';
import { isValidCpf, normalizeCpf } from '../../shared/utils/cpf.js';
import { stableHash } from '../../shared/utils/hash.js';
import { clientOf, customerOf, requireClient, requireCustomer } from '../auth/auth.middleware.js';
import { CONSENT_PERMISSIONS, validatePermissions } from './consent-rules.js';
import * as service from './consents.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_HEADER = 'x-idempotency-key';

const consentIdParam = z.object({ consentId: z.uuid('consentId deve ser um UUID') });

// ---------------------------------------------------------------------------
// Endpoints da instituição receptora (padrão /open-banking/...)
// ---------------------------------------------------------------------------

export const clientConsentsRouter = Router();

const createConsentBody = z.object({
  data: z.object({
    loggedUser: z.object({
      document: z.object({
        identification: z.string().transform(normalizeCpf).refine(isValidCpf, 'CPF inválido'),
        rel: z.literal('CPF'),
      }),
    }),
    permissions: z.array(z.enum(CONSENT_PERMISSIONS)),
    expirationDateTime: z.iso.datetime({ offset: true }).optional(),
  }),
});

clientConsentsRouter.post('/consents', requireClient, async (req, res) => {
  const client = clientOf(req);

  const idempotencyKey = req.get(IDEMPOTENCY_HEADER);
  if (!idempotencyKey || idempotencyKey.length > 128) {
    throw badRequest(
      'IDEMPOTENCY_KEY_REQUIRED',
      `Envie o header ${IDEMPOTENCY_HEADER} (até 128 caracteres).`,
    );
  }

  const { data } = parse(createConsentBody, req.body);

  const permissionError = validatePermissions(data.permissions);
  if (permissionError) throw unprocessable('INVALID_PERMISSIONS', permissionError);

  const now = Date.now();
  const maxExpiration = new Date(now + env.CONSENT_MAX_DAYS * DAY_MS);
  const expirationDateTime = data.expirationDateTime
    ? new Date(data.expirationDateTime)
    : maxExpiration;
  if (expirationDateTime.getTime() <= now || expirationDateTime > maxExpiration) {
    throw unprocessable(
      'INVALID_EXPIRATION',
      `expirationDateTime deve estar no futuro e em no máximo ${env.CONSENT_MAX_DAYS} dias.`,
    );
  }

  const result = await service.createConsent(req, {
    clientUuid: client.clientUuid,
    cpf: data.loggedUser.document.identification,
    permissions: data.permissions,
    expirationDateTime,
    idempotencyKey,
    requestHash: stableHash(req.body),
  });

  if (result.replayed) res.set('x-idempotency-replayed', 'true');
  res.status(result.status).json(result.body);
});

clientConsentsRouter.get('/consents/:consentId', requireClient, async (req, res) => {
  const { consentId } = parse(consentIdParam, req.params);
  const consent = await service.getConsentForClient(req, clientOf(req).clientUuid, consentId);
  res.json(single(req, consent));
});

clientConsentsRouter.delete('/consents/:consentId', requireClient, async (req, res) => {
  const { consentId } = parse(consentIdParam, req.params);
  await service.revokeByClient(req, clientOf(req).clientUuid, consentId);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Endpoints do titular (simulam a tela de autorização no app do banco)
// ---------------------------------------------------------------------------

export const customerConsentsRouter = Router();

const listQuery = paginationQuery.extend({
  status: z.enum(consentStatusEnum.enumValues).optional(),
});

customerConsentsRouter.get('/consents', requireCustomer, async (req, res) => {
  const query = parse(listQuery, req.query);
  const result = await service.listConsentsForCustomer(req, customerOf(req).cpf, {
    status: query.status,
    page: query.page,
    pageSize: query['page-size'],
  });
  res.json(result);
});

customerConsentsRouter.get('/consents/:consentId', requireCustomer, async (req, res) => {
  const { consentId } = parse(consentIdParam, req.params);
  const consent = await service.getConsentForCustomer(req, customerOf(req).cpf, consentId);
  res.json(single(req, consent));
});

const authoriseBody = z.object({
  accountIds: z
    .array(z.uuid())
    .min(1, 'Escolha ao menos uma conta para compartilhar')
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, 'Contas repetidas'),
});

customerConsentsRouter.post('/consents/:consentId/authorise', requireCustomer, async (req, res) => {
  const { consentId } = parse(consentIdParam, req.params);
  const { accountIds } = parse(authoriseBody, req.body);
  const consent = await service.authoriseConsent(req, customerOf(req), consentId, accountIds);
  res.json(single(req, consent));
});

customerConsentsRouter.post('/consents/:consentId/reject', requireCustomer, async (req, res) => {
  const { consentId } = parse(consentIdParam, req.params);
  const consent = await service.rejectConsent(req, customerOf(req).cpf, consentId);
  res.json(single(req, consent));
});

customerConsentsRouter.post('/consents/:consentId/revoke', requireCustomer, async (req, res) => {
  const { consentId } = parse(consentIdParam, req.params);
  const consent = await service.revokeByCustomer(req, customerOf(req).cpf, consentId);
  res.json(single(req, consent));
});
