require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const swaggerSpec = require('./config/swagger');
const { defaultLimiter } = require('./middlewares/rateLimiter.middleware');
const errorHandler = require('./middlewares/errorHandler.middleware');
const AppError = require('./utils/AppError');
const logger = require('./utils/logger');

const authRoutes = require('./routes/auth.routes');
const consentRoutes = require('./routes/consent.routes');
const accountRoutes = require('./routes/account.routes');

const app = express();

// Segurança
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));

// Rate limiting global
app.use(defaultLimiter);

// Parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Logging HTTP
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    version: require('../package.json').version,
  });
});

// Documentação Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Open Finance Consent API',
  customCss: '.swagger-ui .topbar { background-color: #1a56db; }',
}));

// Rotas
app.use('/auth', authRoutes);
app.use('/consents', consentRoutes);
app.use('/accounts', accountRoutes);

// Rota não encontrada
app.use('*', (req, res, next) => {
  next(new AppError(`Rota ${req.originalUrl} não encontrada`, 404, 'ROUTE_NOT_FOUND'));
});

// Handler de erros
app.use(errorHandler);

module.exports = app;
