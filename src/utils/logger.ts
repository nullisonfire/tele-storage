import pino from 'pino';
import { config } from '../config';

// Sanitize sensitive values such as bot token or session secrets
const redactPaths = [
  'token',
  'botToken',
  'clientSecret',
  'sessionSecret',
  'headers.authorization',
  'headers.cookie',
  'req.headers.cookie',
  'req.headers.authorization',
  '*.password',
  '*.secret',
];

export const logger = pino({
  level: config.logger.level,
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  transport:
    config.env !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            ignore: 'pid,hostname',
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          },
        }
      : undefined,
});
