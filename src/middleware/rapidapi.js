// src/middleware/rapidapi.js
// RapidAPI proxy-secret validation middleware

import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Validate RapidAPI proxy secret from request headers
 * RapidAPI forwards the proxy-secret in the x-rapidapi-proxy-secret header
 */
export const validateRapidApiSecret = async (request, reply) => {
  try {
    const proxySecret = request.headers['x-rapidapi-proxy-secret'];

    if (!proxySecret) {
      logger.warn('Missing x-rapidapi-proxy-secret header');
      return reply.status(403).send({
        success: false,
        message: 'Unauthorized: Missing x-rapidapi-proxy-secret header',
        code: 'INVALID_API_KEY',
        timestamp: new Date().toISOString(),
      });
    }

    if (proxySecret !== config.rapidapiProxySecret) {
      logger.warn('Invalid x-rapidapi-proxy-secret');
      return reply.status(403).send({
        success: false,
        message: 'Unauthorized: Invalid proxy secret',
        code: 'INVALID_API_KEY',
        timestamp: new Date().toISOString(),
      });
    }

    // Secret is valid, proceed to next handler
  } catch (error) {
    logger.error({ error }, 'RapidAPI validation error');
    return reply.status(500).send({
      success: false,
      message: 'Internal server error',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
};

export default validateRapidApiSecret;
