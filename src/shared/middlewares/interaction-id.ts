import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { badRequest } from '../errors/app-error.js';

export const INTERACTION_ID_HEADER = 'x-fapi-interaction-id';

const uuidSchema = z.uuid();

/**
 * Correlaciona requisição, resposta, logs e auditoria.
 * Se o consumidor enviar o header, ele precisa ser um UUID e é devolvido igual; senão geramos um.
 */
export const interactionId: RequestHandler = (req, res, next) => {
  const received = req.get(INTERACTION_ID_HEADER);
  const id = received ?? randomUUID();

  req.interactionId = uuidSchema.safeParse(id).success ? id : randomUUID();
  res.setHeader(INTERACTION_ID_HEADER, req.interactionId);

  if (received !== undefined && received !== req.interactionId) {
    return next(
      badRequest('INVALID_INTERACTION_ID', `O header ${INTERACTION_ID_HEADER} deve ser um UUID.`),
    );
  }
  next();
};
