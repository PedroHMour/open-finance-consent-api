/**
 * Regras de negócio do consentimento, sem acesso a banco ou HTTP.
 * Por serem funções puras, são testadas isoladamente (tests/unit/consent-rules.test.ts).
 */
import type { ConsentStatus, RejectedBy, RejectionReason } from '../../db/schema.js';

export const CONSENT_PERMISSIONS = [
  'ACCOUNTS_READ',
  'ACCOUNTS_BALANCES_READ',
  'ACCOUNTS_TRANSACTIONS_READ',
  'RESOURCES_READ',
] as const;

export type ConsentPermission = (typeof CONSENT_PERMISSIONS)[number];

/** Tempo que o titular tem para autorizar um consentimento depois de criado. */
export const AUTHORISATION_WINDOW_MS = 60 * 60 * 1000;

/**
 * Valida a combinação de permissões pedida pela receptora.
 * Retorna uma mensagem de erro ou null se estiver tudo certo.
 */
export function validatePermissions(permissions: readonly string[]): string | null {
  if (permissions.length === 0) return 'Informe ao menos uma permissão.';

  const unknown = permissions.filter(
    (p) => !(CONSENT_PERMISSIONS as readonly string[]).includes(p),
  );
  if (unknown.length > 0) return `Permissões desconhecidas: ${unknown.join(', ')}.`;

  if (new Set(permissions).size !== permissions.length) return 'Permissões repetidas.';

  // Como no Open Finance, RESOURCES_READ acompanha sempre os demais agrupamentos.
  if (!permissions.includes('RESOURCES_READ')) return 'RESOURCES_READ é obrigatória.';

  if (!permissions.includes('ACCOUNTS_READ')) {
    return 'ACCOUNTS_READ é obrigatória (as demais permissões de conta dependem dela).';
  }

  return null;
}

export interface StatusChange {
  status: ConsentStatus;
  rejectedBy?: RejectedBy;
  rejectionReason?: RejectionReason;
}

export type ConsentEvent =
  'CUSTOMER_AUTHORISE' | 'CUSTOMER_REJECT' | 'CUSTOMER_REVOKE' | 'CLIENT_REVOKE';

/**
 * Máquina de estados do consentimento.
 *
 *   AWAITING_AUTHORISATION --autoriza--> AUTHORISED
 *   AWAITING_AUTHORISATION --rejeita / receptora revoga / prazo--> REJECTED
 *   AUTHORISED --titular revoga / receptora revoga / vencimento--> REJECTED
 *   REJECTED é final.
 *
 * Retorna a mudança, ou null se o evento não é permitido no status atual.
 */
export function nextStatus(current: ConsentStatus, event: ConsentEvent): StatusChange | null {
  switch (event) {
    case 'CUSTOMER_AUTHORISE':
      return current === 'AWAITING_AUTHORISATION' ? { status: 'AUTHORISED' } : null;
    case 'CUSTOMER_REJECT':
      return current === 'AWAITING_AUTHORISATION'
        ? { status: 'REJECTED', rejectedBy: 'USER', rejectionReason: 'CUSTOMER_MANUALLY_REJECTED' }
        : null;
    case 'CUSTOMER_REVOKE':
      return current === 'AUTHORISED'
        ? { status: 'REJECTED', rejectedBy: 'USER', rejectionReason: 'CUSTOMER_MANUALLY_REVOKED' }
        : null;
    case 'CLIENT_REVOKE':
      return current === 'REJECTED'
        ? null
        : { status: 'REJECTED', rejectedBy: 'TPP', rejectionReason: 'CLIENT_REVOKED' };
  }
}

/**
 * Verifica se o consentimento venceu pelo tempo. Retorna a mudança a aplicar, ou null.
 */
export function expiryChange(
  consent: { status: ConsentStatus; createdAt: Date; expirationDateTime: Date },
  now: Date,
): StatusChange | null {
  const maxDateReached = now >= consent.expirationDateTime;

  if (consent.status === 'AUTHORISED' && maxDateReached) {
    return { status: 'REJECTED', rejectedBy: 'ASPSP', rejectionReason: 'CONSENT_MAX_DATE_REACHED' };
  }

  // Nunca autorizado: expirou antes de o titular decidir.
  if (
    consent.status === 'AWAITING_AUTHORISATION' &&
    (maxDateReached || now.getTime() - consent.createdAt.getTime() >= AUTHORISATION_WINDOW_MS)
  ) {
    return { status: 'REJECTED', rejectedBy: 'ASPSP', rejectionReason: 'CONSENT_EXPIRED' };
  }

  return null;
}
