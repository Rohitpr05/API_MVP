// src/plugins/rateLimit.js
// Simple in-memory IP-based rate limiter plugin for Fastify

import { RateLimitError } from '../utils/errors.js';
import { config } from '../config/env.js';

const DEFAULT_WINDOW_MS = 60000;

export function registerRateLimit(fastify, opts, done) {
  const rateLimit = parseInt(process.env.RATE_LIMIT || String(config.rateLimitPerMinute || 60), 10);
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(DEFAULT_WINDOW_MS), 10);

  // Map of ip -> { count, windowStart }
  const store = new Map();

  fastify.addHook('onRequest', async (request, reply) => {
    try {
      const ip = request.ip || request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown';
      const now = Date.now();
      const record = store.get(ip) || { count: 0, windowStart: now };

      if (now - record.windowStart > windowMs) {
        record.count = 0;
        record.windowStart = now;
      }

      record.count += 1;
      store.set(ip, record);

      if (record.count > rateLimit) {
        // Structured rate limit response
        throw new RateLimitError(`Rate limit exceeded: ${rateLimit} requests per ${Math.round(windowMs / 1000)}s`);
      }

      // Periodic cleanup to prevent memory growth
      if (store.size > 10000) {
        const cutoff = now - windowMs * 2;
        for (const [key, val] of store.entries()) {
          if (val.windowStart < cutoff) store.delete(key);
        }
      }
    } catch (err) {
      // Propagate as Fastify error
      reply.send(err);
    }
  });

  done();
}

export default registerRateLimit;
