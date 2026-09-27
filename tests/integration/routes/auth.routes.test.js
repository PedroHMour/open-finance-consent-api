const request = require('supertest');

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
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $on: jest.fn(),
}));

const prisma = require('../../../src/config/database');
const app = require('../../../src/app');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = 'test-integration-secret';
process.env.JWT_REFRESH_SECRET = 'test-integration-refresh-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

describe('Auth Routes - Integração', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /auth/register', () => {
    it('deve retornar 201 ao criar usuário válido', async () => {
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

      const res = await request(app).post('/auth/register').send({
        name: 'João Silva',
        email: 'joao@email.com',
        password: 'Senha@123',
        cpf: '123.456.789-00',
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('deve retornar 400 com dados inválidos', async () => {
      const res = await request(app).post('/auth/register').send({
        name: '',
        email: 'email-invalido',
        password: '123',
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('deve retornar 409 se e-mail já existir', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'uuid-1' });

      const res = await request(app).post('/auth/register').send({
        name: 'João Silva',
        email: 'joao@email.com',
        password: 'Senha@123',
        cpf: '123.456.789-00',
      });

      expect(res.statusCode).toBe(409);
    });
  });

  describe('POST /auth/login', () => {
    it('deve retornar 200 com token ao autenticar', async () => {
      const passwordHash = await bcrypt.hash('Senha@123', 12);
      prisma.user.findUnique.mockResolvedValue({
        id: 'uuid-1',
        name: 'João',
        email: 'joao@email.com',
        passwordHash,
        role: 'USER',
        cpf: '123.456.789-00',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.refreshToken.create.mockResolvedValue({});

      const res = await request(app).post('/auth/login').send({
        email: 'joao@email.com',
        password: 'Senha@123',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('deve retornar 401 com credenciais inválidas', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const res = await request(app).post('/auth/login').send({
        email: 'nao@existe.com',
        password: 'Senha@123',
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /health', () => {
    it('deve retornar status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
