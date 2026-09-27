const { Router } = require('express');
const { body, query } = require('express-validator');
const consentController = require('../controllers/consent.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { auditLog } = require('../middlewares/auditLogger.middleware');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Consentimentos
 *   description: Gestão de consentimentos Open Finance
 */

/**
 * @swagger
 * /consents:
 *   post:
 *     summary: Criar novo consentimento
 *     tags: [Consentimentos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clientId, clientName, permissions]
 *             properties:
 *               clientId:
 *                 type: string
 *                 example: client-bank-xyz-001
 *               clientName:
 *                 type: string
 *                 example: Banco XYZ
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [ACCOUNTS_READ, ACCOUNTS_BALANCES_READ, ACCOUNTS_TRANSACTIONS_READ, CUSTOMERS_PERSONAL_IDENTIFICATIONS_READ]
 *                 example: [ACCOUNTS_READ, ACCOUNTS_BALANCES_READ]
 *               accountIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Consentimento criado
 */
router.post(
  '/',
  authenticate,
  [
    body('clientId').trim().notEmpty().withMessage('clientId é obrigatório'),
    body('clientName').trim().notEmpty().withMessage('clientName é obrigatório'),
    body('permissions').isArray({ min: 1 }).withMessage('Ao menos uma permissão é obrigatória'),
    body('accountIds').optional().isArray(),
    body('expiresAt').optional().isISO8601().withMessage('expiresAt deve ser uma data ISO 8601 válida'),
    validate,
  ],
  auditLog('CREATE', 'Consent'),
  consentController.createConsent
);

/**
 * @swagger
 * /consents:
 *   get:
 *     summary: Listar consentimentos do usuário
 *     tags: [Consentimentos]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [AWAITING_AUTHORISATION, AUTHORISED, REJECTED, REVOKED, EXPIRED]
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
 *         description: Lista de consentimentos
 */
router.get(
  '/',
  authenticate,
  [
    query('status').optional().isIn(['AWAITING_AUTHORISATION', 'AUTHORISED', 'REJECTED', 'REVOKED', 'EXPIRED']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    validate,
  ],
  consentController.listConsents
);

/**
 * @swagger
 * /consents/{consentId}:
 *   get:
 *     summary: Obter consentimento por ID
 *     tags: [Consentimentos]
 *     parameters:
 *       - in: path
 *         name: consentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Dados do consentimento
 *       404:
 *         description: Consentimento não encontrado
 */
router.get('/:consentId', authenticate, consentController.getConsent);

/**
 * @swagger
 * /consents/{consentId}/authorise:
 *   patch:
 *     summary: Autorizar consentimento
 *     tags: [Consentimentos]
 *     parameters:
 *       - in: path
 *         name: consentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Consentimento autorizado
 */
router.patch(
  '/:consentId/authorise',
  authenticate,
  auditLog('AUTHORISE', 'Consent'),
  consentController.authorizeConsent
);

/**
 * @swagger
 * /consents/{consentId}/revoke:
 *   patch:
 *     summary: Revogar consentimento
 *     tags: [Consentimentos]
 *     parameters:
 *       - in: path
 *         name: consentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Consentimento revogado
 */
router.patch(
  '/:consentId/revoke',
  authenticate,
  auditLog('REVOKE', 'Consent'),
  consentController.revokeConsent
);

module.exports = router;
