// src/controllers/extraction.controller.js
// Extraction request handlers - RapidAPI marketplace

import {
  extractionRequestSchema,
} from '../schemas/extraction.js';
import {
  extractFromUrl,
} from '../services/extraction.service.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { logger } from '../utils/logger.js';

/**
 * GET /health
 * Health check endpoint
 */
export const health = async (request, reply) => {
  const uptime = process.uptime();

  return reply.status(200).send(
    successResponse(
      {
        status: 'healthy',
        uptime: Math.round(uptime),
      },
      'API is healthy'
    )
  );
};

/**
 * POST /extract
 * Extract structured data from URL
 * Protected by RapidAPI proxy-secret header
 */
export const extract = async (request, reply) => {
  try {
    // Validate request body
    logger.info({ rawSchema: request.body?.schema }, 'Raw incoming schema received');

    const validationResult = extractionRequestSchema.safeParse(request.body);

    if (!validationResult.success) {
      const rejectedSchemaFields = validationResult.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        received: issue.received,
        expected: issue.expected,
        code: issue.code,
      }));

      logger.warn(
        { rawSchema: request.body?.schema, rejectedSchemaFields },
        'Schema validation rejected incoming schema'
      );

      return reply.status(400).send(
        errorResponse(
          {
            message: 'Validation failed',
            details: rejectedSchemaFields,
          },
          400
        )
      );
    }

    const validated = validationResult.data;

    logger.info(
      { validatedSchema: validated.schema, schemaKeys: Object.keys(validated.schema || {}) },
      'Schema validation complete'
    );
    const startedAt = Date.now();

    logger.info(
      { url: validated.url, validatedSchema: validated.schema, schemaKeys: Object.keys(validated.schema || {}) },
      'Final validated schema before extraction pipeline'
    );

    // Extract data (no user tracking needed - RapidAPI handles it)
    const result = await extractFromUrl(validated);

    const responsePayload = successResponse(result, 'Extraction successful');

    logger.info(
      { url: validated.url, durationMs: Date.now() - startedAt, tokensUsed: result?.usage?.tokensUsed || 0 },
      'Extraction request completed'
    );

    logger.info(
      { url: validated.url, responsePayload },
      'Final response payload before send'
    );

    return reply.status(200).send(responsePayload);
  } catch (error) {
    logger.error({ error }, 'Extraction error');

    if (error.name === 'ZodError') {
      return reply.status(400).send(
        errorResponse({
          message: 'Validation failed',
          details: error.errors,
        }, 400)
      );
    }

    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send(errorResponse(error, statusCode));
  }
};

export default {
  health,
  extract,
};
