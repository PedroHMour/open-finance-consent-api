import type { z } from 'zod';
import { badRequest } from '../errors/app-error.js';

/** Valida e converte a entrada; em caso de erro devolve 400 listando os campos inválidos. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(corpo)'}: ${issue.message}`)
      .join('; ');
    throw badRequest('INVALID_PARAMETER', detail);
  }
  return result.data;
}
