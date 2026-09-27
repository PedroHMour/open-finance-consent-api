const { Router } = require('express');
const { query } = require('express-validator');
const accountController = require('../controllers/account.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Contas
 *   description: Acesso a contas e dados financeiros (requer consentimento)
 */

/**
 * @swagger
 * /accounts:
 *   get:
 *     summary: Listar contas do usuário
 *     tags: [Contas]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lista de contas
 */
router.get(
  '/',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    validate,
  ],
  accountController.listAccounts
);

/**
 * @swagger
 * /accounts/{accountId}/balances:
 *   get:
 *     summary: Consultar saldo de uma conta (requer consentimento com ACCOUNTS_BALANCES_READ)
 *     tags: [Contas]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: x-consent-id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do consentimento autorizado com permissão ACCOUNTS_BALANCES_READ
 *     responses:
 *       200:
 *         description: Saldo da conta
 *       403:
 *         description: Consentimento inválido ou permissão negada
 */
router.get('/:accountId/balances', authenticate, accountController.getAccountBalance);

/**
 * @swagger
 * /accounts/{accountId}/transactions:
 *   get:
 *     summary: Listar transações de uma conta (requer consentimento com ACCOUNTS_TRANSACTIONS_READ)
 *     tags: [Contas]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: x-consent-id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lista de transações
 *       403:
 *         description: Consentimento inválido ou permissão negada
 */
router.get(
  '/:accountId/transactions',
  authenticate,
  [
    query('fromDate').optional().isISO8601(),
    query('toDate').optional().isISO8601(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validate,
  ],
  accountController.getAccountTransactions
);

module.exports = router;
