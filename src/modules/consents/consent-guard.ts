import type { RequestHandler } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { consentAccounts, consents } from '../../db/schema.js';
import { recordAudit } from '../../shared/audit.js';
import { AppError, badRequest, forbidden } from '../../shared/errors/app-error.js';
import { clientOf } from '../auth/auth.middleware.js';
import type { ConsentPermission } from './consent-rules.js';
import { refreshExpiry } from './consents.service.js';

export const CONSENT_ID_HEADER = 'x-consent-id';

/**
 * Protege os endpoints de dados. Só libera se:
 *  1. o consentimento existe e pertence à receptora que fez a chamada;
 *  2. está AUTHORISED (e não venceu);
 *  3. inclui a permissão exigida pelo endpoint.
 * Toda negação é registrada na auditoria.
 *
 * Simplificação: no Open Finance real o consentimento fica vinculado ao access token
 * (fluxo authorization code + FAPI). Aqui ele é informado no header x-consent-id.
 */
export function requireConsent(permission: ConsentPermission): RequestHandler {
  return async (req, _res, next) => {
    const client = clientOf(req);
    const consentId = req.get(CONSENT_ID_HEADER);

    if (!consentId || !z.uuid().safeParse(consentId).success) {
      throw badRequest('CONSENT_ID_REQUIRED', `Envie o header ${CONSENT_ID_HEADER} com um UUID.`);
    }

    try {
      const found = await db.query.consents.findFirst({
        where: and(eq(consents.id, consentId), eq(consents.clientId, client.clientUuid)),
      });
      if (!found)
        throw forbidden('CONSENT_INVALID', 'Consentimento inexistente ou de outra receptora.');

      const consent = await refreshExpiry(db, req, found);
      if (consent.status !== 'AUTHORISED') {
        throw forbidden(
          'CONSENT_NOT_AUTHORISED',
          `Consentimento com status ${consent.status} não permite acesso a dados.`,
        );
      }
      if (!consent.permissions.includes(permission)) {
        throw forbidden('PERMISSION_NOT_GRANTED', `O consentimento não concede ${permission}.`);
      }

      const linked = await db
        .select({ accountId: consentAccounts.accountId })
        .from(consentAccounts)
        .where(eq(consentAccounts.consentId, consent.id));

      req.consent = {
        consentId: consent.id,
        customerId: consent.customerId!,
        permissions: consent.permissions as ConsentPermission[],
        accountIds: linked.map((l) => l.accountId),
      };
      next();
    } catch (error) {
      if (error instanceof AppError) {
        await recordAudit(db, req, {
          action: 'DATA_ACCESS',
          outcome: 'DENIED',
          consentId,
          details: { permission, path: req.path, reason: error.code },
        });
      }
      throw error;
    }
  };
}
