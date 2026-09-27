require('dotenv').config();

const app = require('./app');
const logger = require('./utils/logger');
const prisma = require('./config/database');

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await prisma.$connect();
    logger.info('✅ Banco de dados conectado');

    const server = app.listen(PORT, () => {
      logger.info(`🚀 Servidor rodando na porta ${PORT}`);
      logger.info(`📚 Documentação: http://localhost:${PORT}/api-docs`);
      logger.info(`🏥 Health check: http://localhost:${PORT}/health`);
    });

    const shutdown = async (signal) => {
      logger.info(`${signal} recebido. Encerrando servidor...`);
      server.close(async () => {
        await prisma.$disconnect();
        logger.info('Servidor encerrado.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Falha ao iniciar servidor:', error);
    process.exit(1);
  }
};

startServer();
