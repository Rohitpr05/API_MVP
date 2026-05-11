// src/plugins/helmet.js
// Security headers plugin

import fastifyHelmet from '@fastify/helmet';

/**
 * Register Helmet plugin for security headers
 */
export async function registerHelmetPlugin(fastify) {
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: false, // Adjust based on your needs
  });
}

export default registerHelmetPlugin;
