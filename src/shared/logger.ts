import { pino } from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  // Nunca registrar credenciais em log.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.client_secret'],
    censor: '[REDACTED]',
  },
  ...(env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } },
  }),
});
