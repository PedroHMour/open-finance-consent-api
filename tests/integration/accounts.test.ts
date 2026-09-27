import { and, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, pool } from '../../src/db/client.js';
import { auditLogs } from '../../src/db/schema.js';
import { app, authorisedScenario, createTransaction, resetDb } from '../helpers/fixtures.js';

beforeEach(resetDb);
afterAll(() => pool.end());

const ACCOUNTS = '/open-banking/accounts/v1/accounts';

function get(path: string, token: string, consentId?: string) {
  const req = request(app).get(path).set('Authorization', `Bearer ${token}`);
  return consentId ? req.set('x-consent-id', consentId) : req;
}

describe('dados de contas com consentimento autorizado', () => {
  it('lista apenas as contas incluídas no consentimento', async () => {
    const { tppToken, consentId, shared } = await authorisedScenario();

    const res = await get(ACCOUNTS, tppToken, consentId).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      accountId: shared.id,
      type: 'CONTA_DEPOSITO_A_VISTA',
    });

    const resources = await get('/open-banking/resources/v1/resources', tppToken, consentId).expect(
      200,
    );
    expect(resources.body.data).toEqual([
      { resourceId: shared.id, type: 'ACCOUNT', status: 'AVAILABLE' },
    ]);
  });

  it('devolve saldos como string com 2 casas decimais', async () => {
    const { tppToken, consentId, shared } = await authorisedScenario();

    const res = await get(`${ACCOUNTS}/${shared.id}/balances`, tppToken, consentId).expect(200);
    expect(res.body.data).toMatchObject({
      availableAmount: { amount: '1000.50', currency: 'BRL' },
      blockedAmount: { amount: '20.00', currency: 'BRL' },
    });
  });

  it('filtra transações por data e pagina', async () => {
    const { tppToken, consentId, shared } = await authorisedScenario();
    await createTransaction(shared.id, '2026-03-01T10:00:00Z', { description: 'fora do filtro' });
    await createTransaction(shared.id, '2026-03-10T10:00:00Z', { description: 'A' });
    await createTransaction(shared.id, '2026-03-15T10:00:00Z', {
      description: 'B',
      creditDebitType: 'CREDITO',
      amountCents: 250_000,
    });
    await createTransaction(shared.id, '2026-03-20T23:59:00Z', { description: 'C' });

    const url = `${ACCOUNTS}/${shared.id}/transactions?fromBookingDate=2026-03-10&toBookingDate=2026-03-20&page-size=2`;
    const page1 = await get(url, tppToken, consentId).expect(200);

    expect(page1.body.meta).toMatchObject({ totalRecords: 3, totalPages: 2 });
    // Mais recentes primeiro; o último dia do filtro entra por inteiro.
    expect(page1.body.data.map((t: { transactionName: string }) => t.transactionName)).toEqual([
      'C',
      'B',
    ]);
    expect(page1.body.data[1]).toMatchObject({
      creditDebitType: 'CREDITO',
      transactionAmount: { amount: '2500.00', currency: 'BRL' },
    });

    const page2 = await get(`${url}&page=2`, tppToken, consentId).expect(200);
    expect(page2.body.data.map((t: { transactionName: string }) => t.transactionName)).toEqual([
      'A',
    ]);
  });

  it('recusa intervalo de datas invertido', async () => {
    const { tppToken, consentId, shared } = await authorisedScenario();
    const res = await get(
      `${ACCOUNTS}/${shared.id}/transactions?fromBookingDate=2026-03-20&toBookingDate=2026-03-10`,
      tppToken,
      consentId,
    ).expect(422);
    expect(res.body.errors[0].code).toBe('INVALID_DATE_RANGE');
  });
});

describe('acesso negado', () => {
  it('conta do titular fora do consentimento', async () => {
    const { tppToken, consentId, notShared } = await authorisedScenario();
    const res = await get(`${ACCOUNTS}/${notShared.id}/balances`, tppToken, consentId).expect(403);
    expect(res.body.errors[0].code).toBe('ACCOUNT_NOT_COVERED_BY_CONSENT');
  });

  it('permissão não concedida no consentimento', async () => {
    const { tppToken, consentId, shared } = await authorisedScenario([
      'ACCOUNTS_READ',
      'RESOURCES_READ',
    ]);
    const res = await get(`${ACCOUNTS}/${shared.id}/balances`, tppToken, consentId).expect(403);
    expect(res.body.errors[0].code).toBe('PERMISSION_NOT_GRANTED');
  });

  it('sem x-consent-id', async () => {
    const { tppToken } = await authorisedScenario();
    const res = await get(ACCOUNTS, tppToken).expect(400);
    expect(res.body.errors[0].code).toBe('CONSENT_ID_REQUIRED');
  });

  it('após o titular revogar', async () => {
    const { tppToken, mariaToken, consentId, shared } = await authorisedScenario();
    await request(app)
      .post(`/customer/consents/${consentId}/revoke`)
      .set('Authorization', `Bearer ${mariaToken}`)
      .expect(200);

    const res = await get(`${ACCOUNTS}/${shared.id}`, tppToken, consentId).expect(403);
    expect(res.body.errors[0].code).toBe('CONSENT_NOT_AUTHORISED');
  });

  it('após a data de expiração o consentimento vence', async () => {
    const { tppToken, consentId } = await authorisedScenario();
    await db.execute(
      sql`update consents set expiration_date_time = now() - interval '1 second' where id = ${consentId}`,
    );

    await get(ACCOUNTS, tppToken, consentId).expect(403);
    const consent = await get(`/open-banking/consents/v1/consents/${consentId}`, tppToken).expect(
      200,
    );
    expect(consent.body.data.rejection.reason.code).toBe('CONSENT_MAX_DATE_REACHED');
  });
});

describe('auditoria', () => {
  it('registra acessos concedidos e negados com o x-fapi-interaction-id', async () => {
    const { tppToken, consentId, shared, notShared } = await authorisedScenario();
    const interactionId = 'f3b2a0e4-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

    const ok = await get(`${ACCOUNTS}/${shared.id}/balances`, tppToken, consentId)
      .set('x-fapi-interaction-id', interactionId)
      .expect(200);
    expect(ok.headers['x-fapi-interaction-id']).toBe(interactionId);

    await get(`${ACCOUNTS}/${notShared.id}/balances`, tppToken, consentId).expect(403);

    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'DATA_ACCESS'), eq(auditLogs.consentId, consentId)))
      .orderBy(auditLogs.id);

    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      outcome: 'SUCCESS',
      actorType: 'CLIENT',
      actorId: 'fintech-a',
      resourceType: 'ACCOUNT_BALANCES',
      resourceId: shared.id,
      interactionId,
    });
    expect(logs[1]).toMatchObject({
      outcome: 'DENIED',
      resourceId: notShared.id,
      details: expect.objectContaining({ reason: 'ACCOUNT_NOT_COVERED_BY_CONSENT' }),
    });
  });
});

describe('infraestrutura HTTP', () => {
  it('health check verifica o banco', async () => {
    await request(app).get('/health').expect(200, { status: 'ok', database: 'up' });
  });

  it('gera x-fapi-interaction-id quando não enviado e recusa valor inválido', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.headers['x-fapi-interaction-id']).toMatch(/^[0-9a-f-]{36}$/);

    const bad = await request(app)
      .get('/health')
      .set('x-fapi-interaction-id', 'nao-e-uuid')
      .expect(400);
    expect(bad.body.errors[0].code).toBe('INVALID_INTERACTION_ID');
  });

  it('rota inexistente responde 404 no envelope padrão', async () => {
    const res = await request(app).get('/nao-existe').expect(404);
    expect(res.body.errors[0].code).toBe('ROUTE_NOT_FOUND');
  });

  it('serve a especificação OpenAPI', async () => {
    const res = await request(app).get('/docs.json').expect(200);
    expect(res.body.openapi).toMatch(/^3\./);
  });
});
