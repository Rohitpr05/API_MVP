// src/plugins/cors.js
// CORS plugin configuration

import fastifyCors from '@fastify/cors';

/**
 * Register CORS plugin
 */
export async function registerCorsPlugin(fastify) {
  await fastify.register(fastifyCors, {
    origin: true, // In production, specify allowed origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });
}

export default registerCorsPlugin;
