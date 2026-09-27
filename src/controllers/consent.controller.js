const consentService = require('../services/consent.service');

const createConsent = async (req, res, next) => {
  try {
    const { clientId, clientName, permissions, accountIds, expiresAt } = req.body;
    const consent = await consentService.createConsent({
      userId: req.user.id,
      clientId,
      clientName,
      permissions,
      accountIds,
      expiresAt,
    });

    res.status(201).json({
      status: 'success',
      message: 'Consentimento criado. Aguardando autorização do usuário.',
      data: consent,
    });
  } catch (error) {
    next(error);
  }
};

const authorizeConsent = async (req, res, next) => {
  try {
    const { consentId } = req.params;
    const consent = await consentService.authorizeConsent({
      consentId,
      userId: req.user.id,
    });

    res.status(200).json({
      status: 'success',
      message: 'Consentimento autorizado com sucesso',
      data: consent,
    });
  } catch (error) {
    next(error);
  }
};

const revokeConsent = async (req, res, next) => {
  try {
    const { consentId } = req.params;
    const consent = await consentService.revokeConsent({
      consentId,
      userId: req.user.id,
      revokedBy: req.user.id,
    });

    res.status(200).json({
      status: 'success',
      message: 'Consentimento revogado com sucesso',
      data: consent,
    });
  } catch (error) {
    next(error);
  }
};

const getConsent = async (req, res, next) => {
  try {
    const { consentId } = req.params;
    const consent = await consentService.getConsentById({
      consentId,
      userId: req.user.id,
    });

    res.status(200).json({
      status: 'success',
      data: consent,
    });
  } catch (error) {
    next(error);
  }
};

const listConsents = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await consentService.listConsents({
      userId: req.user.id,
      status,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
    });

    res.status(200).json({
      status: 'success',
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { createConsent, authorizeConsent, revokeConsent, getConsent, listConsents };
