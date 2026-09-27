import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool } from '../../src/db/client.js';
import { customers } from '../../src/db/schema.js';
import {
  app,
  clientToken,
  CPF_MARIA,
  createClient,
  createCustomer,
  customerToken,
  PASSWORD,
  resetDb,
} from '../helpers/fixtures.js';

beforeEach(resetDb);
afterAll(() => pool.end());

describe('POST /oauth/token (client_credentials)', () => {
  beforeEach(async () => {
    await createClient('fintech-a', 'segredo-a');
  });

  it('emite token com credenciais no corpo (form-urlencoded)', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'client_credentials',
        client_id: 'fintech-a',
        client_secret: 'segredo-a',
      })
      .expect(200);

    expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: expect.any(Number) });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('emite token com HTTP Basic', async () => {
    await request(app)
      .post('/oauth/token')
      .auth('fintech-a', 'segredo-a')
      .type('form')
      .send({ grant_type: 'client_credentials' })
      .expect(200);
  });

  it('recusa segredo errado no formato da RFC 6749', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'client_credentials', client_id: 'fintech-a', client_secret: 'errado' })
      .expect(401);
    expect(res.body.error).toBe('invalid_client');
  });

  it('HTTP Basic malformado responde 400, não 500', async () => {
    const malformed = Buffer.from('fintech-a:%E0%A4%A').toString('base64');
    const res = await request(app)
      .post('/oauth/token')
      .set('Authorization', `Basic ${malformed}`)
      .type('form')
      .send({ grant_type: 'client_credentials' })
      .expect(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('recusa grant_type não suportado', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'password' })
      .expect(400);
    expect(res.body.error).toBe('unsupported_grant_type');
  });
});

describe('POST /customer/login', () => {
  beforeEach(async () => {
    await createCustomer(CPF_MARIA);
  });

  it('autentica com CPF com ou sem máscara', async () => {
    await request(app)
      .post('/customer/login')
      .send({ cpf: '529.982.247-25', password: PASSWORD })
      .expect(200);
    await customerToken(CPF_MARIA);
  });

  it('senha errada e CPF inexistente dão a mesma resposta', async () => {
    const wrongPassword = await request(app)
      .post('/customer/login')
      .send({ cpf: CPF_MARIA, password: 'errada' })
      .expect(401);
    const unknownCpf = await request(app)
      .post('/customer/login')
      .send({ cpf: '11144477735', password: PASSWORD })
      .expect(401);
    expect(wrongPassword.body.errors[0].detail).toBe(unknownCpf.body.errors[0].detail);
  });

  it('recusa CPF inválido com 400', async () => {
    const res = await request(app)
      .post('/customer/login')
      .send({ cpf: '12345678900', password: PASSWORD })
      .expect(400);
    expect(res.body.errors[0].code).toBe('INVALID_PARAMETER');
  });
});

describe('proteção dos endpoints', () => {
  it('exige token', async () => {
    const res = await request(app).get('/customer/consents').expect(401);
    expect(res.body.errors[0].code).toBe('UNAUTHORIZED');
  });

  it('o token não carrega o CPF (dado pessoal)', async () => {
    await createCustomer(CPF_MARIA);
    const token = await customerToken(CPF_MARIA);
    const payload = jwt.decode(token) as Record<string, unknown>;
    expect(JSON.stringify(payload)).not.toContain(CPF_MARIA);
    expect(payload).toMatchObject({ typ: 'customer', sub: expect.any(String) });
  });

  it('token de titular que não existe mais é recusado', async () => {
    const maria = await createCustomer(CPF_MARIA);
    const token = await customerToken(CPF_MARIA);
    await db.delete(customers).where(eq(customers.id, maria.id));

    await request(app)
      .get('/customer/consents')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('recusa token assinado com outro segredo', async () => {
    const forged = jwt.sign(
      { typ: 'client', client_id: 'x' },
      'outro-segredo-qualquer-com-32-chars!!',
      {
        subject: '00000000-0000-4000-8000-000000000000',
        issuer: 'open-finance-consent-api',
      },
    );
    await request(app)
      .get('/customer/consents')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });

  it('token de receptora não acessa endpoint de titular (e vice-versa)', async () => {
    await createCustomer(CPF_MARIA);
    const { secret } = await createClient('fintech-a');
    const tpp = await clientToken('fintech-a', secret);
    const maria = await customerToken(CPF_MARIA);

    const res = await request(app)
      .get('/customer/consents')
      .set('Authorization', `Bearer ${tpp}`)
      .expect(403);
    expect(res.body.errors[0].code).toBe('WRONG_TOKEN_TYPE');

    await request(app)
      .get('/open-banking/accounts/v1/accounts')
      .set('Authorization', `Bearer ${maria}`)
      .expect(403);
  });
});
