jest.mock('../../../src/config/database', () => ({
  consent: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  account: {
    findMany: jest.fn(),
  },
}));

const prisma = require('../../../src/config/database');
const consentService = require('../../../src/services/consent.service');
const AppError = require('../../../src/utils/AppError');

const mockConsent = {
  id: 'consent-uuid-1',
  userId: 'user-uuid-1',
  clientId: 'client-001',
  clientName: 'Banco XYZ',
  status: 'AWAITING_AUTHORISATION',
  permissions: ['ACCOUNTS_READ', 'ACCOUNTS_BALANCES_READ'],
  expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
  revokedAt: null,
  accounts: [],
};

describe('ConsentService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createConsent', () => {
    it('deve criar consentimento com sucesso', async () => {
      prisma.consent.create.mockResolvedValue(mockConsent);

      const result = await consentService.createConsent({
        userId: 'user-uuid-1',
        clientId: 'client-001',
        clientName: 'Banco XYZ',
        permissions: ['ACCOUNTS_READ'],
      });

      expect(result).toHaveProperty('id');
      expect(result.status).toBe('AWAITING_AUTHORISATION');
    });

    it('deve lançar erro com permissão inválida', async () => {
      await expect(
        consentService.createConsent({
          userId: 'user-uuid-1',
          clientId: 'client-001',
          clientName: 'Banco XYZ',
          permissions: ['PERMISSAO_INVALIDA'],
        })
      ).rejects.toThrow(AppError);
    });

    it('deve lançar erro se data de expiração for passada', async () => {
      await expect(
        consentService.createConsent({
          userId: 'user-uuid-1',
          clientId: 'client-001',
          clientName: 'Banco XYZ',
          permissions: ['ACCOUNTS_READ'],
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        })
      ).rejects.toThrow(AppError);
    });
  });

  describe('authorizeConsent', () => {
    it('deve autorizar consentimento em status AWAITING_AUTHORISATION', async () => {
      prisma.consent.findFirst.mockResolvedValue(mockConsent);
      prisma.consent.update.mockResolvedValue({ ...mockConsent, status: 'AUTHORISED' });

      const result = await consentService.authorizeConsent({
        consentId: 'consent-uuid-1',
        userId: 'user-uuid-1',
      });

      expect(result.status).toBe('AUTHORISED');
    });

    it('deve lançar erro ao tentar autorizar consentimento já autorizado', async () => {
      prisma.consent.findFirst.mockResolvedValue({ ...mockConsent, status: 'AUTHORISED' });

      await expect(
        consentService.authorizeConsent({ consentId: 'consent-uuid-1', userId: 'user-uuid-1' })
      ).rejects.toThrow(AppError);
    });

    it('deve lançar erro se consentimento não existir', async () => {
      prisma.consent.findFirst.mockResolvedValue(null);

      await expect(
        consentService.authorizeConsent({ consentId: 'nao-existe', userId: 'user-uuid-1' })
      ).rejects.toThrow(AppError);
    });
  });

  describe('revokeConsent', () => {
    it('deve revogar consentimento autorizado', async () => {
      prisma.consent.findFirst.mockResolvedValue({ ...mockConsent, status: 'AUTHORISED' });
      prisma.consent.update.mockResolvedValue({ ...mockConsent, status: 'REVOKED', revokedAt: new Date() });

      const result = await consentService.revokeConsent({
        consentId: 'consent-uuid-1',
        userId: 'user-uuid-1',
        revokedBy: 'user-uuid-1',
      });

      expect(result.status).toBe('REVOKED');
    });

    it('deve lançar erro ao tentar revogar consentimento já revogado', async () => {
      prisma.consent.findFirst.mockResolvedValue({ ...mockConsent, status: 'REVOKED' });

      await expect(
        consentService.revokeConsent({ consentId: 'consent-uuid-1', userId: 'user-uuid-1', revokedBy: 'user-uuid-1' })
      ).rejects.toThrow(AppError);
    });
  });
});
