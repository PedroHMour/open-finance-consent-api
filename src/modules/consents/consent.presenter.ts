import type { Client, Consent } from '../../db/schema.js';

/** Visão do consentimento entregue à instituição receptora. */
export function presentConsent(consent: Consent) {
  return {
    consentId: consent.id,
    status: consent.status,
    permissions: consent.permissions,
    creationDateTime: consent.createdAt.toISOString(),
    statusUpdateDateTime: consent.statusUpdateDateTime.toISOString(),
    expirationDateTime: consent.expirationDateTime.toISOString(),
    ...(consent.status === 'REJECTED' && {
      rejection: {
        rejectedBy: consent.rejectedBy,
        reason: { code: consent.rejectionReason },
      },
    }),
  };
}

/** Visão do consentimento para o titular: inclui quem pediu e quais contas foram compartilhadas. */
export function presentConsentForCustomer(
  consent: Consent,
  client: Pick<Client, 'name' | 'cnpj'>,
  accountIds: string[],
) {
  return {
    ...presentConsent(consent),
    requestedBy: { name: client.name, cnpj: client.cnpj },
    sharedAccountIds: accountIds,
  };
}
