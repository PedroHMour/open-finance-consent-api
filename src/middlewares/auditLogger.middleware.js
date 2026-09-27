const prisma = require('../config/database');
const logger = require('../utils/logger');

const auditLog = (action, entity) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = async (data) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          await prisma.auditLog.create({
            data: {
              userId: req.user?.id || null,
              consentId: req.params?.consentId || data?.data?.id || null,
              action,
              entity,
              entityId: req.params?.id || req.params?.consentId || data?.data?.id || 'unknown',
              details: {
                method: req.method,
                url: req.originalUrl,
                statusCode: res.statusCode,
              },
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
            },
          });
        } catch (err) {
          logger.error('Erro ao registrar audit log:', err);
        }
      }
      return originalJson(data);
    };

    next();
  };
};

module.exports = { auditLog };
