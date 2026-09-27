import type { Request } from 'express';
import type { DbExecutor } from '../db/client.js';
import { auditLogs } from '../db/schema.js';
import { AppError } from './errors/app-error.js';
import { logger } from './logger.js';

export interface AuditEntry {
  action: string;
  outcome: 'SUCCESS' | 'DENIED';
  consentId?: string | null;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

function actorOf(req: Request): { actorType: 'CUSTOMER' | 'CLIENT' | 'SYSTEM'; actorId: string } {
  if (req.auth?.type === 'CUSTOMER') return { actorType: 'CUSTOMER', actorId: req.auth.customerId };
  if (req.auth?.type === 'CLIENT') return { actorType: 'CLIENT', actorId: req.auth.clientId };
  return { actorType: 'SYSTEM', actorId: 'system' };
}

export async function recordAudit(
  executor: DbExecutor,
  req: Request,
  entry: AuditEntry,
  actor = actorOf(req),
): Promise<void> {
  await executor.insert(auditLogs).values({
    interactionId: req.interactionId,
    ...actor,
    action: entry.action,
    outcome: entry.outcome,
    consentId: entry.consentId ?? null,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    details: entry.details,
    ip: req.ip,
  });
}

export function recordSystemAudit(executor: DbExecutor, req: Request, entry: AuditEntry) {
  return recordAudit(executor, req, entry, { actorType: 'SYSTEM', actorId: 'system' });
}

/**
 * Executa um acesso a dados e registra o resultado na auditoria:
 * SUCCESS se deu certo, DENIED se foi negado (403/404). Outros erros apenas propagam.
 */
export async function auditedAccess<T>(
  executor: DbExecutor,
  req: Request,
  entry: Omit<AuditEntry, 'outcome'>,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const result = await fn();
    await recordAudit(executor, req, { ...entry, outcome: 'SUCCESS' });
    return result;
  } catch (error) {
    if (error instanceof AppError && (error.status === 403 || error.status === 404)) {
      await recordAudit(executor, req, {
        ...entry,
        outcome: 'DENIED',
        details: { ...entry.details, reason: error.code },
      }).catch((auditError: unknown) =>
        logger.error({ err: auditError }, 'Falha ao registrar auditoria de acesso negado'),
      );
    }
    throw error;
  }
}
