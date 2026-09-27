/**
 * Erro de negócio com status HTTP e código estável.
 * O código é o que o consumidor da API deve usar para tratar o erro; a mensagem é para humanos.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly title: string,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, detail: string) =>
  new AppError(400, code, 'Requisição inválida', detail);

export const unauthorized = (detail = 'Credenciais ausentes ou inválidas.') =>
  new AppError(401, 'UNAUTHORIZED', 'Não autorizado', detail);

export const forbidden = (code: string, detail: string) =>
  new AppError(403, code, 'Acesso negado', detail);

export const notFound = (code: string, detail: string) =>
  new AppError(404, code, 'Não encontrado', detail);

export const conflict = (code: string, detail: string) =>
  new AppError(409, code, 'Conflito', detail);

export const unprocessable = (code: string, detail: string) =>
  new AppError(422, code, 'Não processável', detail);
