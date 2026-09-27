import type { ConsentPermission } from '../../modules/consents/consent-rules.js';

export type AuthContext =
  | { type: 'CUSTOMER'; customerId: string; cpf: string }
  | { type: 'CLIENT'; clientUuid: string; clientId: string };

export interface ConsentContext {
  consentId: string;
  customerId: string;
  permissions: ConsentPermission[];
  accountIds: string[];
}

declare global {
  namespace Express {
    interface Request {
      /** Identificador de correlação (x-fapi-interaction-id), presente em toda requisição. */
      interactionId: string;
      auth?: AuthContext;
      consent?: ConsentContext;
    }
  }
}
