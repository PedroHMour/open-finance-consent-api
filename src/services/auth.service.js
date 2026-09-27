const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  });

  const refreshToken = jwt.sign({ sub: userId, jti: uuidv4() }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });

  return { accessToken, refreshToken };
};

const register = async ({ name, email, password, cpf }) => {
  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ email }, { cpf }] },
  });

  if (existingUser) {
    throw new AppError('E-mail ou CPF já cadastrado', 409, 'USER_ALREADY_EXISTS');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { name, email, passwordHash, cpf },
    select: { id: true, name: true, email: true, cpf: true, role: true, createdAt: true },
  });

  const { accessToken, refreshToken } = generateTokens(user.id);

  const decoded = jwt.decode(refreshToken);
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(decoded.exp * 1000),
    },
  });

  return { user, accessToken, refreshToken };
};

const login = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError('Credenciais inválidas', 401, 'INVALID_CREDENTIALS');
  }

  const { accessToken, refreshToken } = generateTokens(user.id);

  const decoded = jwt.decode(refreshToken);
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(decoded.exp * 1000),
    },
  });

  const { passwordHash, ...userWithoutPassword } = user;

  return { user: userWithoutPassword, accessToken, refreshToken };
};

const refreshAccessToken = async (refreshToken) => {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError('Refresh token inválido ou expirado', 401, 'INVALID_REFRESH_TOKEN');
  }

  const storedToken = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });

  if (!storedToken) {
    throw new AppError('Refresh token não encontrado ou já utilizado', 401, 'REFRESH_TOKEN_NOT_FOUND');
  }

  await prisma.refreshToken.delete({ where: { token: refreshToken } });

  const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded.sub);

  const newDecoded = jwt.decode(newRefreshToken);
  await prisma.refreshToken.create({
    data: {
      token: newRefreshToken,
      userId: decoded.sub,
      expiresAt: new Date(newDecoded.exp * 1000),
    },
  });

  return { accessToken, refreshToken: newRefreshToken };
};

const logout = async (refreshToken) => {
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
};

module.exports = { register, login, refreshAccessToken, logout };
