import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, pool } from '../../src/db/client.js';
import { auditLogs, consents } from '../../src/db/schema.js';
import {
  app,
  authorise,
  clientToken,
  consentBody,
  CPF_JOAO,
  CPF_MARIA,
  createAccount,
  createClient,
  createConsent,
  createCustomer,
  customerToken,
  resetDb,
} from '../helpers/fixtures.js';

beforeEach(resetDb);
afterAll(() => pool.end());

const CONSENTS = '/open-banking/consents/v1/consents';

async function setup() {
  const maria = await createCustomer(CPF_MARIA, 'Maria');
  const account = await createAccount(maria.id);
  const { client, secret } = await createClient('fintech-a');
  const tppToken = await clientToken(client.clientId, secret);
  const mariaToken = await customerToken(CPF_MARIA);
  return { maria, account, client, tppToken, mariaToken };
}

describe('criação de consentimento (receptora)', () => {
  it('cria com status AWAITING_AUTHORISATION no envelope do Open Finance', async () => {
    const { tppToken } = await setup();

    const res = await request(app)
      .post(CONSENTS)
      .set('Authorization', `Bearer ${tppToken}`)
      .set('x-idempotency-key', 'chave-1')
      .send(consentBody('529.982.247-25'))
      .expect(201);

    expect(res.body.data).toMatchObject({
      consentId: expect.any(String),
      status: 'AWAITING_AUTHORISATION',
      permissions: expect.arrayContaining(['RESOURCES_READ']),
    });
    expect(res.body.links.self).toContain(CONSENTS);
    expect(res.body.meta).toMatchObject({ totalRecords: 1, totalPages: 1 });
  });

  it('exige x-idempotency-key', async () => {
    const { tppToken } = await setup();
    const res = await request(app)
      .post(CONSENTS)
      .set('Authorization', `Bearer ${tppToken}`)
      .send(consentBody(CPF_MARIA))
      .expect(400);
    expect(res.body.errors[0].code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it.each([
    ['sem RESOURCES_READ', consentBody(CPF_MARIA, ['ACCOUNTS_READ']), 422, 'INVALID_PERMISSIONS'],
    [
      'expiração no passado',
      consentBody(CPF_MARIA, undefined, '2020-01-01T00:00:00Z'),
      422,
      'INVALID_EXPIRATION',
    ],
    [
      'expiração acima do máximo',
      consentBody(CPF_MARIA, undefined, '2099-01-01T00:00:00Z'),
      422,
      'INVALID_EXPIRATION',
    ],
    ['CPF inválido', consentBody('12345678900'), 400, 'INVALID_PARAMETER'],
    ['permissão desconhecida', consentBody(CPF_MARIA, ['XPTO']), 400, 'INVALID_PARAMETER'],
  ])('recusa %s', async (_caso, body, status, code) => {
    const { tppToken } = await setup();
    const res = await request(app)
      .post(CONSENTS)
      .set('Authorization', `Bearer ${tppToken}`)
      .set('x-idempotency-key', 'k')
      .send(body)
      .expect(status);
    expect(res.body.errors[0].code).toBe(code);
  });

  it('JSON malformado responde 400 sem vazar detalhes', async () => {
    const { tppToken } = await setup();
    const res = await request(app)
      .post(CONSENTS)
      .set('Authorization', `Bearer ${tppToken}`)
      .set('x-idempotency-key', 'k')
      .set('Content-Type', 'application/json')
      .send('{"data": ')
      .expect(400);
    expect(res.body.errors[0].code).toBe('INVALID_JSON');
  });
});

describe('idempotência', () => {
  it('repetir a requisição devolve o mesmo consentimento sem criar outro', async () => {
    const { tppToken } = await setup();
    const send = () =>
      request(app)
        .post(CONSENTS)
        .set('Authorization', `Bearer ${tppToken}`)
        .set('x-idempotency-key', 'mesma-chave')
        .send(consentBody(CPF_MARIA));

    const first = await send().expect(201);
    const second = await send().expect(201);

    expect(second.body.data.consentId).toBe(first.body.data.consentId);
    expect(second.headers['x-idempotency-replayed']).toBe('true');
    expect(await db.$count(consents)).toBe(1);
  });

  it('requisições simultâneas com a mesma chave criam um só consentimento', async () => {
    const { tppToken } = await setup();
    const send = () =>
      request(app)
        .post(CONSENTS)
        .set('Authorization', `Bearer ${tppToken}`)
        .set('x-idempotency-key', 'concorrente')
        .send(consentBody(CPF_MARIA));

    const responses = await Promise.all([send(), send(), send()]);

    expect(responses.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(new Set(responses.map((r) => r.body.data.consentId)).size).toBe(1);
    expect(await db.$count(consents)).toBe(1);
  });

  it('mesma chave com corpo diferente é recusada', async () => {
    const { tppToken } = await setup();
    const post = (body: object) =>
      request(app)
        .post(CONSENTS)
        .set('Authorization', `Bearer ${tppToken}`)
        .set('x-idempotency-key', 'reusada')
        .send(body);

    await post(consentBody(CPF_MARIA)).expect(201);
    const res = await post(consentBody(CPF_JOAO)).expect(422);
    expect(res.body.errors[0].code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

describe('isolamento entre receptoras e titulares', () => {
  it('uma receptora não enxerga consentimento de outra', async () => {
    const { tppToken } = await setup();
    const consentId = await createConsent(tppToken, consentBody(CPF_MARIA));

    const { secret } = await createClient('fintech-b');
    const otherTpp = await clientToken('fintech-b', secret);

    const res = await request(app)
      .get(`${CONSENTS}/${consentId}`)
      .set('Authorization', `Bearer ${otherTpp}`)
      .expect(404);
    expect(res.body.errors[0].code).toBe('CONSENT_NOT_FOUND');
    await request(app)
      .delete(`${CONSENTS}/${consentId}`)
      .set('Authorization', `Bearer ${otherTpp}`)
      .expect(404);
  });

  it('um titular não enxerga nem autoriza consentimento de outro CPF', async () => {
    const { tppToken, account } = await setup();
    await createCustomer(CPF_JOAO, 'João');
    const joaoToken = await customerToken(CPF_JOAO);
    const consentId = await createConsent(tppToken, consentBody(CPF_MARIA));

    await request(app)
      .get(`/customer/consents/${consentId}`)
      .set('Authorization', `Bearer ${joaoToken}`)
      .expect(404);
    await authorise(joaoToken, consentId, [account.id]).expect(404);

    const list = await request(app)
      .get('/customer/consents')
      .set('Authorization', `Bearer ${joaoToken}`)
      .expect(200);
    expect(list.body.data).toEqual([]);
  });

  it('titular não pode compartilhar conta de outra pessoa', async () => {
    const { tppToken, mariaToken } = await setup();
    const joao = await createCustomer(CPF_JOAO, 'João');
    const joaoAccount = await createAccount(joao.id);
    const consentId = await createConsent(tppToken, consentBody(CPF_MARIA));

    const res = await authorise(mariaToken, consentId, [joaoAccount.id]).expect(422);
    expect(res.body.errors[0].code).toBe('INVALID_ACCOUNTS');

    // A transação foi desfeita: o consentimento continua aguardando.
    const after = await db.query.consents.findFirst({ where: eq(consents.id, consentId) });
    expect(after?.status).toBe('AWAITING_AUTHORISATION');
  });
});

describe('ciclo de vida', () => {
  it('titular vê quem pediu, autoriza e não pode autorizar de novo', async () => {
    const { tppToken, mariaToken, account } = await setup();
    const consentId = await createConsent(tppToken, consentBody(CPF_MARIA));

    const list = await request(app)
      .get('/customer/consents')
      .set('Authorization', `Bearer ${mariaToken}`)
      .expect(200);
    expect(list.body.data[0]).toMatchObject({
      consentId,
      status: 'AWAITING_AUTHORISATION',
      requestedBy: { name: 'Receptora fintech-a' },
    });

    const ok = await authorise(mariaToken, consentId, [account.id]).expect(200);
    expect(ok.body.data).toMatchObject({ status: 'AUTHORISED', sharedAccountIds: [account.id] });

    const again = await authorise(mariaToken, consentId, [account.id]).expect(422);
    expect(again.body.errors[0].code).toBe('CONSENT_INVALID_STATUS');

    const tppView = await request(app)
      .get(`${CONSENTS}/${consentId}`)
      .set('Authorization', `Bearer ${tppToken}`)
      .expect(200);
    expect(tppView.body.data.status).toBe('AUTHORISED');
  });

  it('titular rejeita', async () => {
    const { tppToken, mariaToken } = await setup();
    const consentId = await createConsent(tppToken, consentBody(CPF_MARIA));

    const res = await request(app)
      .post(`/customer/consents/${consentId}/reject`)
      .set('Authorization', `Bearer ${mariaToken}`)
      .expect(200);
    expect(res.body.data.rejection).toEqual({
      rejectedBy: 'USER',
      reason: { code: 'CUSTOMER_MANUALLY_REJECTED' },
    });
  });

  it('receptora revoga com DELETE e o status fica REJECTED', async () => {
    const { tppToken } = await setup();
    const consentId = await createConsent(tppToken, consentBody(CPF_MARIA));

    await request(app)
      .delete(`${CONSENTS}/${consentId}`)
      .set('Authorization', `Bearer ${tppToken}`)
      .expect(204);
    const res = await request(app)
      .get(`${CONSENTS}/${consentId}`)
      .set('Authorization', `Bearer ${tppToken}`)
      .expect(200);
    expect(res.body.data).toMatchObject({
      status: 'REJECTED',
      rejection: { rejectedBy: 'TPP', reason: { code: 'CLIENT_REVOKED' } },
    });

    await request(app)
      .delete(`${CONSENTS}/${consentId}`)
      .set('Authorization', `Bearer ${tppToken}`)
      .expect(422);
  });

  it('sem autorização em 60 minutos o consentimento é rejeitado', async () => {
    const { tppToken, mariaToken, account } = await setup();
    const consentId = await createConsent(tppToken, consentBody(CPF_MARIA));
    await db.execute(
      sql`update consents set created_at = now() - interval '61 minutes' where id = ${consentId}`,
    );

    const list = await request(app)
      .get('/customer/consents?status=REJECTED')
      .set('Authorization', `Bearer ${mariaToken}`)
      .expect(200);
    expect(list.body.data[0].rejection.reason.code).toBe('CONSENT_EXPIRED');

    const res = await authorise(mariaToken, consentId, [account.id]).expect(422);
    expect(res.body.errors[0].code).toBe('CONSENT_INVALID_STATUS');

    const expiredAudit = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'CONSENT_EXPIRED'));
    expect(expiredAudit).toHaveLength(1);
    expect(expiredAudit[0]).toMatchObject({ actorType: 'SYSTEM', consentId });
  });

  it('vencimento fica gravado e auditado mesmo quando a operação pedida é recusada', async () => {
    const { tppToken, mariaToken, account } = await setup();
    const consentId = await createConsent(tppToken, consentBody(CPF_MARIA));
    await db.execute(
      sql`update consents set created_at = now() - interval '61 minutes' where id = ${consentId}`,
    );

    // Autoriza direto, sem listar antes: a listagem não pode ser o que grava o vencimento.
    const res = await authorise(mariaToken, consentId, [account.id]).expect(422);
    expect(res.body.errors[0].detail).toContain('CONSENT_EXPIRED');

    const stored = await db.query.consents.findFirst({ where: eq(consents.id, consentId) });
    expect(stored).toMatchObject({
      status: 'REJECTED',
      rejectedBy: 'ASPSP',
      rejectionReason: 'CONSENT_EXPIRED',
    });
    const audit = await db.select().from(auditLogs).where(eq(auditLogs.consentId, consentId));
    expect(audit.map((entry) => entry.action)).toContain('CONSENT_EXPIRED');
  });

  it('paginação da lista do titular', async () => {
    const { tppToken, mariaToken } = await setup();
    for (let i = 0; i < 3; i++) await createConsent(tppToken, consentBody(CPF_MARIA));

    const res = await request(app)
      .get('/customer/consents?page=2&page-size=2')
      .set('Authorization', `Bearer ${mariaToken}`)
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ totalRecords: 3, totalPages: 2 });
    expect(res.body.links.prev).toContain('page=1');
    expect(res.body.links.next).toBeUndefined();
  });

  it('consentId que não é UUID responde 400', async () => {
    const { tppToken } = await setup();
    const res = await request(app)
      .get(`${CONSENTS}/abc`)
      .set('Authorization', `Bearer ${tppToken}`)
      .expect(400);
    expect(res.body.errors[0].code).toBe('INVALID_PARAMETER');
  });
});
