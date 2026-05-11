// src/schemas/extraction.js
// Extraction request/response validation schemas

import { z } from 'zod';

/**
 * Extraction request schema
 * Define what the client should send for extraction
 */
export const extractionRequestSchema = z.object({
  url: z.string().url('Invalid URL'),
  schema: z.record(z.string(), z.enum(['string', 'number', 'boolean', 'array', 'object'])),
  options: z
    .object({
      model: z.string().optional(),
      timeout: z.number().optional(),
    })
    .optional(),
});

/**
 * Extraction response schema
 * Define what the API returns after extraction
 */
export const extractionResponseSchema = z.object({
  success: z.boolean(),
  data: z.record(z.any()).optional(),
  error: z.string().optional(),
  extractionId: z.string(),
  timestamp: z.string(),
});

/**
 * Health check response schema
 */
export const healthResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  timestamp: z.string(),
  uptime: z.number(),
});

export default {
  extractionRequestSchema,
  extractionResponseSchema,
  healthResponseSchema,
};
