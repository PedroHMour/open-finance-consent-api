const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const prisma = require('../config/database');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Token de acesso não fornecido', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AppError('Token expirado', 401, 'TOKEN_EXPIRED');
      }
      throw new AppError('Token inválido', 401, 'INVALID_TOKEN');
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      throw new AppError('Usuário não encontrado', 401, 'USER_NOT_FOUND');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('Acesso negado. Permissão insuficiente.', 403, 'FORBIDDEN')
      );
    }
    next();
  };
};

module.exports = { authenticate, authorize };
