import type { Request } from 'express';

/**
 * Envelopes de resposta no formato usado pelas APIs do Open Finance Brasil:
 * { data, links, meta } no sucesso e { errors, meta } na falha.
 */

export interface Meta {
  totalRecords: number;
  totalPages: number;
  requestDateTime: string;
}

export interface Links {
  self: string;
  first?: string;
  prev?: string;
  next?: string;
  last?: string;
}

const now = () => new Date().toISOString();

export function selfLink(req: Request): string {
  return `${req.protocol}://${req.get('host')}${req.originalUrl}`;
}

export function single<T>(req: Request, data: T) {
  return {
    data,
    links: { self: selfLink(req) } satisfies Links,
    meta: { totalRecords: 1, totalPages: 1, requestDateTime: now() } satisfies Meta,
  };
}

export function paginated<T>(
  req: Request,
  data: T[],
  { page, pageSize, totalRecords }: { page: number; pageSize: number; totalRecords: number },
) {
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const url = new URL(selfLink(req));
  const linkTo = (target: number) => {
    url.searchParams.set('page', String(target));
    url.searchParams.set('page-size', String(pageSize));
    return url.toString();
  };

  const links: Links = { self: selfLink(req), first: linkTo(1), last: linkTo(totalPages) };
  if (page > 1) links.prev = linkTo(Math.min(page - 1, totalPages));
  if (page < totalPages) links.next = linkTo(page + 1);

  return {
    data,
    links,
    meta: { totalRecords, totalPages, requestDateTime: now() } satisfies Meta,
  };
}

export function errorBody(errors: { code: string; title: string; detail: string }[]) {
  return {
    errors,
    meta: { totalRecords: errors.length, totalPages: 1, requestDateTime: now() },
  };
}
