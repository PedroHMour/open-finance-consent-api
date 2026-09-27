const { Router } = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authLimiter } = require('../middlewares/rateLimiter.middleware');
const { validate } = require('../middlewares/validate.middleware');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Autenticação
 *   description: Endpoints de autenticação e gestão de sessão
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Cadastrar novo usuário
 *     tags: [Autenticação]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, cpf]
 *             properties:
 *               name:
 *                 type: string
 *                 example: João Silva
 *               email:
 *                 type: string
 *                 example: joao@email.com
 *               password:
 *                 type: string
 *                 example: Senha@123
 *               cpf:
 *                 type: string
 *                 example: 123.456.789-00
 *     responses:
 *       201:
 *         description: Usuário criado com sucesso
 *       409:
 *         description: E-mail ou CPF já cadastrado
 */
router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage('Nome é obrigatório'),
    body('email').isEmail().withMessage('E-mail inválido').normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Senha deve ter no mínimo 8 caracteres')
      .matches(/(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/)
      .withMessage('Senha deve conter maiúscula, número e caractere especial'),
    body('cpf').notEmpty().withMessage('CPF é obrigatório'),
    validate,
  ],
  authController.register
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Realizar login
 *     tags: [Autenticação]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: joao.silva@email.com.br
 *               password:
 *                 type: string
 *                 example: User@123
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *       401:
 *         description: Credenciais inválidas
 */
router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('E-mail inválido').normalizeEmail(),
    body('password').notEmpty().withMessage('Senha é obrigatória'),
    validate,
  ],
  authController.login
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Renovar access token
 *     tags: [Autenticação]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tokens renovados
 */
router.post(
  '/refresh',
  [body('refreshToken').notEmpty().withMessage('Refresh token é obrigatório'), validate],
  authController.refreshToken
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Realizar logout
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logout realizado com sucesso
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Obter dados do usuário autenticado
 *     tags: [Autenticação]
 *     responses:
 *       200:
 *         description: Dados do usuário
 */
router.get('/me', authenticate, authController.me);

module.exports = router;
