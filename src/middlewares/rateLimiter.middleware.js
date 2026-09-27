const rateLimit = require('express-rate-limit');
const AppError = require('../utils/AppError');

const defaultLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new AppError('Muitas requisições. Tente novamente mais tarde.', 429, 'RATE_LIMIT_EXCEEDED'));
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new AppError('Muitas tentativas de login. Tente novamente em 15 minutos.', 429, 'AUTH_RATE_LIMIT_EXCEEDED'));
  },
});

module.exports = { defaultLimiter, authLimiter };
