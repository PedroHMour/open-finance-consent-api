import { createApp } from './app.js';
import { env, EXAMPLE_JWT_SECRET } from './config/env.js';
import { pool } from './db/client.js';
import { logger } from './shared/logger.js';

if (env.JWT_SECRET === EXAMPLE_JWT_SECRET) {
  logger.warn(
    'JWT_SECRET ainda é o valor do .env.example. Serve para demonstração local; gere um segredo próprio para qualquer outro uso.',
  );
}

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`API ouvindo na porta ${env.PORT}`);
  logger.info(`Documentação: http://localhost:${env.PORT}/docs`);
});

// Encerramento gracioso: para de aceitar conexões, termina as em andamento e fecha o pool do banco.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} recebido, encerrando...`);

  server.close(async () => {
    await pool.end();
    logger.info('Encerrado.');
    process.exit(0);
  });

  // Se algo travar, força a saída depois de 10 segundos.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
