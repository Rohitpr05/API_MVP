// src/utils/logger.js
// Centralized logger using Pino

import pino from 'pino';
import { config } from '../config/env.js';

const loggerConfig =
  config.isDevelopment
    ? {
        level: config.logLevel,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        },
      }
    : {
        level: config.logLevel,
      };

export const logger = pino(loggerConfig);

export default logger;
