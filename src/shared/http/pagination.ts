import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;

/** Parâmetros de paginação no padrão do Open Finance: page e page-size. */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  'page-size': z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
});

export function toOffset(page: number, pageSize: number) {
  return { limit: pageSize, offset: (page - 1) * pageSize };
}
