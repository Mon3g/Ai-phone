import fs from 'fs';
import path from 'path';
import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const transportTargets = [
  {
    target: 'pino/file',
    level: LOG_LEVEL,
    options: {
      destination: 1,
    },
  },
  {
    target: 'pino/file',
    level: LOG_LEVEL,
    options: {
      destination: path.join(LOG_DIR, `${NODE_ENV}.log`),
      mkdir: true,
    },
  },
];

const logger = pino(
  {
    level: LOG_LEVEL,
    formatters: {
      level(label, number) {
        return { level: label, levelNumber: number };
      },
    },
    redact: {
      paths: ['req.headers.authorization', 'headers.authorization', 'authorization'],
      censor: '***',
    },
  },
  pino.transport({ targets: transportTargets })
);

export default logger;
