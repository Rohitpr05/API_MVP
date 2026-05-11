// src/app.js
// Main Fastify application setup - RapidAPI marketplace version

import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';

// Import plugins
import { registerCorsPlugin } from './plugins/cors.js';
import { registerHelmetPlugin } from './plugins/helmet.js';

// Import routes
import { registerExtractionRoutes } from './routes/extraction.routes.js';

/**
 * Create and configure Fastify application
 */
async function createApp() {
  // Initialize Fastify with logger
  const fastify = Fastify({
    logger,
    bodyLimit: 1024 * 1024,
    ajv: {
      customOptions: {
        strict: false,
        removeAdditional: 'all',
        coerceTypes: true,
        useDefaults: true,
      },
    },
  });

  // Register plugins
  await registerHelmetPlugin(fastify);
  await registerCorsPlugin(fastify);

  // Register Swagger/OpenAPI for RapidAPI marketplace
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'JSON Extraction API',
        description: 'Extract structured data from any website using AI',
        version: config.appVersion,
      },
      servers: [
        {
          url: config.publicApiBaseUrl || `http://localhost:${config.port}`,
        },
      ],
      components: {
        securitySchemes: {
          rapidApiSecret: {
            type: 'apiKey',
            name: 'x-rapidapi-proxy-secret',
            in: 'header',
          },
        },
      },
    },
  });

  // Register Swagger UI
  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    logger.error({ error }, 'Request error');

    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';

    return reply.status(statusCode).send({
      success: false,
      message,
      code: error.code || 'ERROR',
      timestamp: new Date().toISOString(),
    });
  });

  // Register routes
  await registerExtractionRoutes(fastify);

  // Root route
  fastify.get('/', async (request, reply) => {
    return {
      name: config.appName,
      version: config.appVersion,
      status: 'running',
      endpoints: {
        docs: 'GET /docs',
        health: 'GET /health',
        extract: 'POST /extract (requires x-rapidapi-proxy-secret header)',
      },
      marketplace: 'RapidAPI',
    };
  });

  return fastify;
}

/**
 * Start the server
 */
async function start() {
  try {
    const fastify = await createApp();

    const shutdown = async (signal) => {
      logger.info({ signal }, 'Shutting down server');
      await fastify.close();
      process.exit(0);
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    // Start listening
    await fastify.listen({ port: config.port, host: '0.0.0.0' });

    logger.info(
      `Server running at http://0.0.0.0:${config.port}`
    );
    logger.info(
      `Swagger docs at http://0.0.0.0:${config.port}/docs`
    );
    logger.info(
      `Environment: ${config.nodeEnv}`
    );
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { createApp, start };
