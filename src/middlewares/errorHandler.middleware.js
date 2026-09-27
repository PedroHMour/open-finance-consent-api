const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.stack = err.stack;

  logger.error(`${err.message} | ${req.method} ${req.originalUrl} | IP: ${req.ip}`);

  // Erros do Prisma
  if (err.code === 'P2002') {
    const field = err.meta?.target?.[0] || 'campo';
    error = new AppError(`Valor duplicado para o campo: ${field}`, 409, 'CONFLICT');
  }

  if (err.code === 'P2025') {
    error = new AppError('Registro não encontrado', 404, 'NOT_FOUND');
  }

  // Erros de validação
  if (err.name === 'ValidationError') {
    error = new AppError(err.message, 400, 'VALIDATION_ERROR');
  }

  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational || false;

  res.status(statusCode).json({
    status: 'error',
    code: error.code || 'INTERNAL_ERROR',
    message: isOperational ? error.message : 'Erro interno do servidor',
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
    }),
  });
};

module.exports = errorHandler;
