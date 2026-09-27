import { describe, expect, it } from 'vitest';
import {
  AUTHORISATION_WINDOW_MS,
  expiryChange,
  nextStatus,
  validatePermissions,
} from '../../src/modules/consents/consent-rules.js';

describe('validatePermissions', () => {
  it('aceita combinação válida', () => {
    expect(
      validatePermissions(['ACCOUNTS_READ', 'ACCOUNTS_BALANCES_READ', 'RESOURCES_READ']),
    ).toBeNull();
  });

  it.each([
    [[], 'ao menos uma'],
    [['ACCOUNTS_READ', 'FOO'], 'desconhecidas'],
    [['ACCOUNTS_READ', 'ACCOUNTS_READ', 'RESOURCES_READ'], 'repetidas'],
    [['ACCOUNTS_READ'], 'RESOURCES_READ'],
    [['ACCOUNTS_BALANCES_READ', 'RESOURCES_READ'], 'ACCOUNTS_READ'],
  ])('rejeita %j', (permissions, message) => {
    expect(validatePermissions(permissions)).toContain(message);
  });
});

describe('nextStatus (máquina de estados)', () => {
  it('autoriza apenas quando aguardando autorização', () => {
    expect(nextStatus('AWAITING_AUTHORISATION', 'CUSTOMER_AUTHORISE')).toEqual({
      status: 'AUTHORISED',
    });
    expect(nextStatus('AUTHORISED', 'CUSTOMER_AUTHORISE')).toBeNull();
    expect(nextStatus('REJECTED', 'CUSTOMER_AUTHORISE')).toBeNull();
  });

  it('titular rejeita só antes de autorizar e revoga só depois', () => {
    expect(nextStatus('AWAITING_AUTHORISATION', 'CUSTOMER_REJECT')).toMatchObject({
      status: 'REJECTED',
      rejectedBy: 'USER',
      rejectionReason: 'CUSTOMER_MANUALLY_REJECTED',
    });
    expect(nextStatus('AUTHORISED', 'CUSTOMER_REJECT')).toBeNull();
    expect(nextStatus('AUTHORISED', 'CUSTOMER_REVOKE')).toMatchObject({
      rejectionReason: 'CUSTOMER_MANUALLY_REVOKED',
    });
    expect(nextStatus('AWAITING_AUTHORISATION', 'CUSTOMER_REVOKE')).toBeNull();
  });

  it('receptora pode revogar em qualquer status não final', () => {
    for (const status of ['AWAITING_AUTHORISATION', 'AUTHORISED'] as const) {
      expect(nextStatus(status, 'CLIENT_REVOKE')).toMatchObject({
        status: 'REJECTED',
        rejectedBy: 'TPP',
        rejectionReason: 'CLIENT_REVOKED',
      });
    }
    expect(nextStatus('REJECTED', 'CLIENT_REVOKE')).toBeNull();
  });
});

describe('expiryChange', () => {
  const createdAt = new Date('2026-01-01T12:00:00Z');
  const expirationDateTime = new Date('2026-06-01T12:00:00Z');

  it('não muda nada dentro do prazo', () => {
    const now = new Date(createdAt.getTime() + 5 * 60 * 1000);
    expect(
      expiryChange({ status: 'AWAITING_AUTHORISATION', createdAt, expirationDateTime }, now),
    ).toBeNull();
  });

  it('rejeita por falta de autorização após a janela', () => {
    const now = new Date(createdAt.getTime() + AUTHORISATION_WINDOW_MS);
    expect(
      expiryChange({ status: 'AWAITING_AUTHORISATION', createdAt, expirationDateTime }, now),
    ).toMatchObject({ rejectedBy: 'ASPSP', rejectionReason: 'CONSENT_EXPIRED' });
  });

  it('a janela de autorização não afeta consentimento já autorizado', () => {
    const now = new Date(createdAt.getTime() + 2 * AUTHORISATION_WINDOW_MS);
    expect(expiryChange({ status: 'AUTHORISED', createdAt, expirationDateTime }, now)).toBeNull();
  });

  it('nunca autorizado até a data de expiração também é CONSENT_EXPIRED', () => {
    expect(
      expiryChange(
        { status: 'AWAITING_AUTHORISATION', createdAt, expirationDateTime },
        expirationDateTime,
      ),
    ).toMatchObject({ rejectionReason: 'CONSENT_EXPIRED' });
  });

  it('autorizado vence ao atingir a data de expiração', () => {
    expect(
      expiryChange({ status: 'AUTHORISED', createdAt, expirationDateTime }, expirationDateTime),
    ).toMatchObject({ rejectionReason: 'CONSENT_MAX_DATE_REACHED' });
  });

  it('consentimento rejeitado não muda mais', () => {
    const now = new Date('2030-01-01T00:00:00Z');
    expect(expiryChange({ status: 'REJECTED', createdAt, expirationDateTime }, now)).toBeNull();
  });
});
