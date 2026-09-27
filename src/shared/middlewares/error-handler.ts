import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, notFound } from '../errors/app-error.js';
import { errorBody } from '../http/envelope.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound('ROUTE_NOT_FOUND', `Rota ${req.method} ${req.path} não existe.`));
};

interface BodyParserError {
  type?: string;
  status?: number;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    return res
      .status(err.status)
      .json(errorBody([{ code: err.code, title: err.title, detail: err.detail }]));
  }

  // Erros do parser de corpo do Express (JSON malformado, corpo grande demais).
  const parserError = err as BodyParserError;
  if (parserError.type === 'entity.parse.failed') {
    return res
      .status(400)
      .json(
        errorBody([
          { code: 'INVALID_JSON', title: 'Requisição inválida', detail: 'Corpo JSON malformado.' },
        ]),
      );
  }
  if (parserError.type === 'entity.too.large') {
    return res.status(413).json(
      errorBody([
        {
          code: 'PAYLOAD_TOO_LARGE',
          title: 'Corpo grande demais',
          detail: 'O corpo da requisição excede o limite.',
        },
      ]),
    );
  }

  // Erro inesperado: registra com detalhes, mas não vaza nada para o consumidor.
  req.log.error({ err, interactionId: req.interactionId }, 'Erro não tratado');
  return res.status(500).json(
    errorBody([
      {
        code: 'INTERNAL_ERROR',
        title: 'Erro interno',
        detail: `Erro inesperado. Informe o x-fapi-interaction-id ${req.interactionId} ao suporte.`,
      },
    ]),
  );
};
