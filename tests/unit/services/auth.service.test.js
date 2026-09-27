const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock do Prisma
jest.mock('../../../src/config/database', () => ({
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

const prisma = require('../../../src/config/database');
const authService = require('../../../src/services/auth.service');
const AppError = require('../../../src/utils/AppError');

process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

describe('AuthService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('deve criar um novo usuário com sucesso', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'uuid-1',
        name: 'João Silva',
        email: 'joao@email.com',
        cpf: '123.456.789-00',
        role: 'USER',
        createdAt: new Date(),
      });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.register({
        name: 'João Silva',
        email: 'joao@email.com',
        password: 'Senha@123',
        cpf: '123.456.789-00',
      });

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe('joao@email.com');
    });

    it('deve lançar erro se e-mail já estiver cadastrado', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'uuid-1', email: 'joao@email.com' });

      await expect(
        authService.register({
          name: 'João Silva',
          email: 'joao@email.com',
          password: 'Senha@123',
          cpf: '123.456.789-00',
        })
      ).rejects.toThrow(AppError);
    });
  });

  describe('login', () => {
    it('deve autenticar usuário com credenciais válidas', async () => {
      const passwordHash = await bcrypt.hash('Senha@123', 12);
      prisma.user.findUnique.mockResolvedValue({
        id: 'uuid-1',
        name: 'João',
        email: 'joao@email.com',
        passwordHash,
        role: 'USER',
      });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.login({ email: 'joao@email.com', password: 'Senha@123' });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe('joao@email.com');
    });

    it('deve lançar erro com credenciais inválidas', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'naoexiste@email.com', password: 'Senha@123' })
      ).rejects.toThrow(AppError);
    });

    it('deve lançar erro com senha incorreta', async () => {
      const passwordHash = await bcrypt.hash('SenhaCorreta@123', 12);
      prisma.user.findUnique.mockResolvedValue({
        id: 'uuid-1',
        email: 'joao@email.com',
        passwordHash,
      });

      await expect(
        authService.login({ email: 'joao@email.com', password: 'SenhaErrada@123' })
      ).rejects.toThrow(AppError);
    });
  });

  describe('logout', () => {
    it('deve remover o refresh token', async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      await authService.logout('some-refresh-token');

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { token: 'some-refresh-token' },
      });
    });
  });
});
