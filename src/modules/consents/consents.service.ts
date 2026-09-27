import type { Request } from 'express';
import { and, count, desc, eq, inArray, lte, or } from 'drizzle-orm';
import { db, type DbExecutor } from '../../db/client.js';
import {
  accounts,
  clients,
  consentAccounts,
  consents,
  idempotencyKeys,
  type Consent,
  type ConsentStatus,
} from '../../db/schema.js';
import { recordAudit, recordSystemAudit } from '../../shared/audit.js';
import { notFound, unprocessable } from '../../shared/errors/app-error.js';
import { paginated, single } from '../../shared/http/envelope.js';
import { toOffset } from '../../shared/http/pagination.js';
import {
  AUTHORISATION_WINDOW_MS,
  expiryChange,
  nextStatus,
  type ConsentEvent,
  type ConsentPermission,
  type StatusChange,
} from './consent-rules.js';
import { presentConsent, presentConsentForCustomer } from './consent.presenter.js';

/** Aplica o vencimento por tempo (se houver) e registra na auditoria. */
export async function refreshExpiry(
  executor: DbExecutor,
  req: Request,
  consent: Consent,
): Promise<Consent> {
  const change = expiryChange(consent, new Date());
  if (!change) return consent;

  const [updated] = await executor
    .update(consents)
    .set({ ...change, statusUpdateDateTime: new Date() })
    .where(and(eq(consents.id, consent.id), eq(consents.status, consent.status)))
    .returning();

  if (!updated) {
    // Outra requisição mudou o status ao mesmo tempo: vale o que está no banco.
    const current = await executor.query.consents.findFirst({ where: eq(consents.id, consent.id) });
    return current ?? consent;
  }

  await recordSystemAudit(executor, req, {
    action: 'CONSENT_EXPIRED',
    outcome: 'SUCCESS',
    consentId: consent.id,
    details: { reason: change.rejectionReason },
  });
  return updated;
}

/** Vence em lote os consentimentos de um CPF que passaram do prazo. */
async function expireDueConsentsForCpf(req: Request, cpf: string) {
  const now = new Date();
  // Mesmas regras de expiryChange (consent-rules.ts), aplicadas em lote no SQL.
  const changes: { where: ReturnType<typeof and>; change: StatusChange }[] = [
    {
      where: and(
        eq(consents.customerCpf, cpf),
        eq(consents.status, 'AUTHORISED'),
        lte(consents.expirationDateTime, now),
      ),
      change: {
        status: 'REJECTED',
        rejectedBy: 'ASPSP',
        rejectionReason: 'CONSENT_MAX_DATE_REACHED',
      },
    },
    {
      where: and(
        eq(consents.customerCpf, cpf),
        eq(consents.status, 'AWAITING_AUTHORISATION'),
        or(
          lte(consents.expirationDateTime, now),
          lte(consents.createdAt, new Date(now.getTime() - AUTHORISATION_WINDOW_MS)),
        ),
      ),
      change: { status: 'REJECTED', rejectedBy: 'ASPSP', rejectionReason: 'CONSENT_EXPIRED' },
    },
  ];

  for (const { where, change } of changes) {
    const expired = await db
      .update(consents)
      .set({ ...change, statusUpdateDateTime: now })
      .where(where)
      .returning({ id: consents.id });
    for (const { id } of expired) {
      await recordSystemAudit(db, req, {
        action: 'CONSENT_EXPIRED',
        outcome: 'SUCCESS',
        consentId: id,
        details: { reason: change.rejectionReason },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Instituição receptora
// ---------------------------------------------------------------------------

export interface CreateConsentInput {
  clientUuid: string;
  cpf: string;
  permissions: ConsentPermission[];
  expirationDateTime: Date;
  idempotencyKey: string;
  requestHash: string;
}

/**
 * Cria um consentimento com idempotência: repetir a requisição com a mesma
 * x-idempotency-key devolve a mesma resposta em vez de criar outro consentimento.
 */
export async function createConsent(req: Request, input: CreateConsentInput) {
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .insert(idempotencyKeys)
      .values({
        clientId: input.clientUuid,
        key: input.idempotencyKey,
        requestHash: input.requestHash,
      })
      .onConflictDoNothing()
      .returning();

    if (!claimed) {
      const previous = await tx.query.idempotencyKeys.findFirst({
        where: and(
          eq(idempotencyKeys.clientId, input.clientUuid),
          eq(idempotencyKeys.key, input.idempotencyKey),
        ),
      });
      if (previous?.requestHash !== input.requestHash) {
        throw unprocessable(
          'IDEMPOTENCY_KEY_REUSED',
          'Esta x-idempotency-key já foi usada com um corpo diferente.',
        );
      }
      // A chave e a resposta são gravadas na mesma transação: uma requisição simultânea
      // espera o INSERT acima até a primeira terminar e só então lê a resposta pronta.
      // Resposta vazia aqui significaria dado inconsistente, não uma requisição em andamento.
      if (previous.responseStatus === null) {
        throw new Error(`Chave de idempotência sem resposta gravada: ${input.idempotencyKey}`);
      }
      return { status: previous.responseStatus, body: previous.responseBody, replayed: true };
    }

    const [consent] = await tx
      .insert(consents)
      .values({
        clientId: input.clientUuid,
        customerCpf: input.cpf,
        permissions: input.permissions,
        expirationDateTime: input.expirationDateTime,
      })
      .returning();

    const body = single(req, presentConsent(consent!));

    await tx
      .update(idempotencyKeys)
      .set({ responseStatus: 201, responseBody: body })
      .where(
        and(
          eq(idempotencyKeys.clientId, input.clientUuid),
          eq(idempotencyKeys.key, input.idempotencyKey),
        ),
      );

    await recordAudit(tx, req, {
      action: 'CONSENT_CREATED',
      outcome: 'SUCCESS',
      consentId: consent!.id,
      details: { permissions: input.permissions },
    });

    return { status: 201, body, replayed: false };
  });
}

export async function getConsentForClient(req: Request, clientUuid: string, consentId: string) {
  const consent = await db.query.consents.findFirst({
    where: and(eq(consents.id, consentId), eq(consents.clientId, clientUuid)),
  });
  // Consentimento de outra receptora responde 404: não revelamos que ele existe.
  if (!consent) throw notFound('CONSENT_NOT_FOUND', 'Consentimento não encontrado.');
  return presentConsent(await refreshExpiry(db, req, consent));
}

export async function revokeByClient(req: Request, clientUuid: string, consentId: string) {
  await applyEvent(req, consentId, 'CLIENT_REVOKE', eq(consents.clientId, clientUuid));
}

// ---------------------------------------------------------------------------
// Titular
// ---------------------------------------------------------------------------

export async function listConsentsForCustomer(
  req: Request,
  cpf: string,
  filters: { status?: ConsentStatus; page: number; pageSize: number },
) {
  await expireDueConsentsForCpf(req, cpf);

  const where = and(
    eq(consents.customerCpf, cpf),
    filters.status ? eq(consents.status, filters.status) : undefined,
  );

  const [rows, [total]] = await Promise.all([
    db
      .select({ consent: consents, client: { name: clients.name, cnpj: clients.cnpj } })
      .from(consents)
      .innerJoin(clients, eq(clients.id, consents.clientId))
      .where(where)
      .orderBy(desc(consents.createdAt))
      .limit(toOffset(filters.page, filters.pageSize).limit)
      .offset(toOffset(filters.page, filters.pageSize).offset),
    db.select({ value: count() }).from(consents).where(where),
  ]);

  const accountIdsByConsent = await linkedAccountIds(rows.map((r) => r.consent.id));

  return paginated(
    req,
    rows.map((r) =>
      presentConsentForCustomer(r.consent, r.client, accountIdsByConsent.get(r.consent.id) ?? []),
    ),
    { page: filters.page, pageSize: filters.pageSize, totalRecords: total?.value ?? 0 },
  );
}

export async function getConsentForCustomer(req: Request, cpf: string, consentId: string) {
  const row = await db
    .select({ consent: consents, client: { name: clients.name, cnpj: clients.cnpj } })
    .from(consents)
    .innerJoin(clients, eq(clients.id, consents.clientId))
    .where(and(eq(consents.id, consentId), eq(consents.customerCpf, cpf)))
    .then((result) => result[0]);

  if (!row) throw notFound('CONSENT_NOT_FOUND', 'Consentimento não encontrado.');

  const consent = await refreshExpiry(db, req, row.consent);
  const accountIds = (await linkedAccountIds([consent.id])).get(consent.id) ?? [];
  return presentConsentForCustomer(consent, row.client, accountIds);
}

export async function authoriseConsent(
  req: Request,
  customer: { customerId: string; cpf: string },
  consentId: string,
  accountIds: string[],
) {
  await applyEvent(
    req,
    consentId,
    'CUSTOMER_AUTHORISE',
    eq(consents.customerCpf, customer.cpf),
    async (tx) => {
      const owned = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.customerId, customer.customerId), inArray(accounts.id, accountIds)));
      if (owned.length !== accountIds.length) {
        throw unprocessable(
          'INVALID_ACCOUNTS',
          'Uma ou mais contas informadas não existem ou não pertencem ao titular.',
        );
      }
      await tx
        .insert(consentAccounts)
        .values(accountIds.map((accountId) => ({ consentId, accountId })));
      return { customerId: customer.customerId };
    },
  );
  return getConsentForCustomer(req, customer.cpf, consentId);
}

export async function rejectConsent(req: Request, cpf: string, consentId: string) {
  await applyEvent(req, consentId, 'CUSTOMER_REJECT', eq(consents.customerCpf, cpf));
  return getConsentForCustomer(req, cpf, consentId);
}

export async function revokeByCustomer(req: Request, cpf: string, consentId: string) {
  await applyEvent(req, consentId, 'CUSTOMER_REVOKE', eq(consents.customerCpf, cpf));
  return getConsentForCustomer(req, cpf, consentId);
}

// ---------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------

const EVENT_ACTION: Record<ConsentEvent, string> = {
  CUSTOMER_AUTHORISE: 'CONSENT_AUTHORISED',
  CUSTOMER_REJECT: 'CONSENT_REJECTED',
  CUSTOMER_REVOKE: 'CONSENT_REVOKED',
  CLIENT_REVOKE: 'CONSENT_REVOKED',
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Aplica um evento da máquina de estados dentro de uma transação,
 * com a linha travada (SELECT ... FOR UPDATE) para evitar duas mudanças simultâneas.
 */
async function applyEvent(
  req: Request,
  consentId: string,
  event: ConsentEvent,
  ownership: ReturnType<typeof eq>,
  beforeUpdate?: (tx: Tx) => Promise<Partial<Consent>>,
) {
  // Se o consentimento venceu, o vencimento precisa ser gravado mesmo que a operação
  // pedida seja recusada. Por isso a recusa é devolvida pela transação (que confirma)
  // e só lançada depois, em vez de lançar lá dentro (o que desfaria o vencimento).
  const refusal = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(consents)
      .where(and(eq(consents.id, consentId), ownership))
      .for('update');

    if (!locked) throw notFound('CONSENT_NOT_FOUND', 'Consentimento não encontrado.');

    const current = await refreshExpiry(tx, req, locked);
    const change = nextStatus(current.status, event);
    if (!change) {
      const reason =
        current.status === 'REJECTED' && current.rejectionReason
          ? ` (motivo: ${current.rejectionReason})`
          : '';
      return unprocessable(
        'CONSENT_INVALID_STATUS',
        `Operação não permitida para consentimento com status ${current.status}${reason}.`,
      );
    }

    const extra = beforeUpdate ? await beforeUpdate(tx) : {};

    await tx
      .update(consents)
      .set({ ...change, ...extra, statusUpdateDateTime: new Date() })
      .where(eq(consents.id, consentId));

    await recordAudit(tx, req, {
      action: EVENT_ACTION[event],
      outcome: 'SUCCESS',
      consentId,
      details: { from: current.status, to: change.status, reason: change.rejectionReason },
    });
    return null;
  });

  if (refusal) throw refusal;
}

async function linkedAccountIds(consentIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (consentIds.length === 0) return map;

  const rows = await db
    .select()
    .from(consentAccounts)
    .where(inArray(consentAccounts.consentId, consentIds));
  for (const row of rows) {
    map.set(row.consentId, [...(map.get(row.consentId) ?? []), row.accountId]);
  }
  return map;
}
