import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { parse as parseYaml } from 'yaml';
import { sql } from 'drizzle-orm';
import { env } from './config/env.js';
import { db } from './db/client.js';
import { authRouter } from './modules/auth/auth.routes.js';
import {
  accountsRouter,
  customerAccountsRouter,
  resourcesRouter,
} from './modules/accounts/accounts.routes.js';
import {
  clientConsentsRouter,
  customerConsentsRouter,
} from './modules/consents/consents.routes.js';
import { logger } from './shared/logger.js';
import { errorHandler, notFoundHandler } from './shared/middlewares/error-handler.js';
import { interactionId } from './shared/middlewares/interaction-id.js';
import { globalRateLimit } from './shared/middlewares/rate-limit.js';

// docs/ fica na raiz do projeto, um nível acima de src/ (dev) ou dist/ (build).
const openApiPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../docs/openapi.yaml',
);
const openApiDocument = parseYaml(readFileSync(openApiPath, 'utf8')) as swaggerUi.JsonObject;

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);
  app.use(interactionId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).interactionId,
      // Log enxuto: só o necessário para investigar uma requisição.
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          interactionId: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // A UI do Swagger usa estilos inline; por isso ela tem uma política de segurança própria.
  app.use(
    '/docs',
    helmet({
      contentSecurityPolicy: {
        directives: {
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
          // Rodando localmente em http, não forçar https nos recursos da página.
          'upgrade-insecure-requests': null,
        },
      },
    }),
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, { customSiteTitle: 'Open Finance Consent API' }),
  );
  app.get('/docs.json', (_req, res) => res.json(openApiDocument));

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS }));
  app.use(globalRateLimit);
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));

  app.get('/health', async (_req, res) => {
    try {
      await db.execute(sql`select 1`);
      res.json({ status: 'ok', database: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  // Autenticação
  app.use(authRouter);

  // Instituição receptora (padrão de rotas do Open Finance)
  app.use('/open-banking/consents/v1', clientConsentsRouter);
  app.use('/open-banking/resources/v1', resourcesRouter);
  app.use('/open-banking/accounts/v1', accountsRouter);

  // Titular
  app.use('/customer', customerConsentsRouter);
  app.use('/customer', customerAccountsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
