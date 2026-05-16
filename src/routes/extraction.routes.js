// src/routes/extraction.routes.js
// Extraction routes - RapidAPI marketplace-focused

import { health, extract } from '../controllers/extraction.controller.js';
import validateRapidApiSecret from '../middleware/rapidapi.js';

const rapidApiSecretHeaderSchema = {
  type: 'object',
  required: ['x-rapidapi-proxy-secret'],
  properties: {
    'x-rapidapi-proxy-secret': { type: 'string' },
  },
  additionalProperties: true,
};

const extractionBodySchema = {
  type: 'object',
  required: ['url', 'schema'],
  properties: {
    url: {
      type: 'string',
      format: 'uri',
      description: 'Target HTTP or HTTPS URL to extract',
      examples: ['https://example.com'],
    },
    schema: {
      type: 'object',
      description: 'Field map describing the output shape. Supports type-names (string) or template-values (null, [], {}).',
      // CRITICAL FIX: Do NOT specify additionalProperties here!
      // Fastify AJV with removeAdditional:'all' will strip properties even if additionalProperties: true
      // By omitting additionalProperties, the schema object will preserve all properties
      // Zod validation will handle detailed type checking
      examples: [
        { title: 'string', price: 'number' },
        { companyName: null },
        { product: { name: null, price: 'number', features: [] } },
      ],
    },
    options: {
      type: 'object',
      properties: {
        model: { type: 'string', example: 'deepseek/deepseek-chat' },
        timeout: { type: 'number', minimum: 1000, maximum: 45000, example: 45000 },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

const successResponseSchema = {
  type: 'object',
  required: ['success', 'message', 'data', 'timestamp'],
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string', example: 'Extraction successful' },
    data: {
      type: 'object',
      required: ['extractionId', 'success', 'data', 'source', 'usage', 'timestamp'],
      properties: {
        extractionId: { type: 'string', example: 'ext_1715504192823_abc123' },
        success: { type: 'boolean', example: true },
        data: { type: 'object', additionalProperties: true },
        source: {
          type: 'object',
          required: ['url', 'title'],
          properties: {
            url: { type: 'string', example: 'https://example.com' },
            title: { type: 'string', example: 'Example Domain' },
          },
        },
        usage: {
          type: 'object',
          required: ['model', 'tokensUsed', 'inputTokens', 'outputTokens'],
          properties: {
            model: { type: 'string', example: 'deepseek/deepseek-chat' },
            tokensUsed: { type: 'number', example: 123 },
            inputTokens: { type: 'number', example: 100 },
            outputTokens: { type: 'number', example: 23 },
          },
        },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
    timestamp: { type: 'string', format: 'date-time' },
  },
};

const errorResponseSchema = {
  type: 'object',
  required: ['success', 'message', 'code', 'timestamp'],
  properties: {
    success: { type: 'boolean', example: false },
    message: { type: 'string', example: 'Unauthorized: Invalid proxy secret' },
    code: { type: 'string', example: 'INVALID_API_KEY' },
    timestamp: { type: 'string', format: 'date-time' },
  },
  examples: [
    { success: false, code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded', timestamp: '2026-01-01T00:00:00Z' },
    { success: false, code: 'INVALID_SCHEMA', message: 'Invalid schema', timestamp: '2026-01-01T00:00:00Z' },
  ],
};

/**
 * Register extraction routes
 */
export async function registerExtractionRoutes(fastify) {
  // Public health check (no auth needed)
  fastify.get('/health', async (request, reply) => {
    return health(request, reply);
  });

  // Protected by RapidAPI proxy-secret header
  fastify.post(
    '/extract',
    {
      onRequest: [validateRapidApiSecret],
      schema: {
        tags: ['Extraction'],
        summary: 'Extract structured data from a webpage',
        description: 'RapidAPI marketplace endpoint for schema-driven web extraction. Requires x-rapidapi-proxy-secret header.',
        headers: rapidApiSecretHeaderSchema,
        body: extractionBodySchema,
        response: {
          200: successResponseSchema,
          400: errorResponseSchema,
          403: errorResponseSchema,
          422: errorResponseSchema,
          504: errorResponseSchema,
          500: errorResponseSchema,
        },
        security: [{ rapidApiSecret: [] }],
      },
    },
    async (request, reply) => {
      return extract(request, reply);
    }
  );
}

export default registerExtractionRoutes;
