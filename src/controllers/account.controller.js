const accountService = require('../services/account.service');

const listAccounts = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await accountService.listAccounts({
      userId: req.user.id,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
    });

    res.status(200).json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
};

const getAccountBalance = async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const consentId = req.headers['x-consent-id'];

    const balance = await accountService.getAccountBalance({
      accountId,
      userId: req.user.id,
      consentId,
    });

    res.status(200).json({ status: 'success', data: balance });
  } catch (error) {
    next(error);
  }
};

const getAccountTransactions = async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const consentId = req.headers['x-consent-id'];
    const { page, limit, fromDate, toDate } = req.query;

    const result = await accountService.getAccountTransactions({
      accountId,
      userId: req.user.id,
      consentId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      fromDate,
      toDate,
    });

    res.status(200).json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
};

module.exports = { listAccounts, getAccountBalance, getAccountTransactions };
