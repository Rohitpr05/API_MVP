// src/utils/errors.js
// Custom error handling utility

/**
 * Custom API Error
 */
export class ApiError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'ApiError';
  }
}

/**
 * Bad Request Error (400)
 */
export class BadRequestError extends ApiError {
  constructor(message) {
    super(message, 400, 'BAD_REQUEST');
    this.name = 'BadRequestError';
  }
}

/**
 * Invalid Schema Error (400)
 */
export class InvalidSchemaError extends ApiError {
  constructor(message = 'Invalid schema') {
    super(message, 400, 'INVALID_SCHEMA');
    this.name = 'InvalidSchemaError';
  }
}

/**
 * Request Too Large (413)
 */
export class RequestTooLargeError extends ApiError {
  constructor(message = 'Request body too large') {
    super(message, 413, 'REQUEST_TOO_LARGE');
    this.name = 'RequestTooLargeError';
  }
}

/**
 * Unprocessable Entity Error (422)
 */
export class UnprocessableEntityError extends ApiError {
  constructor(message = 'Unprocessable Entity') {
    super(message, 422, 'UNPROCESSABLE_ENTITY');
    this.name = 'UnprocessableEntityError';
  }
}

/**
 * Timeout Error (504)
 */
export class TimeoutError extends ApiError {
  constructor(message = 'Gateway Timeout') {
    super(message, 504, 'GATEWAY_TIMEOUT');
    this.name = 'TimeoutError';
  }
}

/**
 * Rate limit exceeded (429)
 */
export class RateLimitError extends ApiError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

/**
 * Bot protection detected (403)
 */
export class BotProtectionError extends ApiError {
  constructor(message = 'Target site is protected by anti-bot systems') {
    super(message, 403, 'BOT_PROTECTION');
    this.name = 'BotProtectionError';
  }
}

/**
 * Extraction failed (500)
 */
export class ExtractionFailedError extends ApiError {
  constructor(message = 'Extraction failed') {
    super(message, 500, 'EXTRACTION_FAILED');
    this.name = 'ExtractionFailedError';
  }
}

/**
 * Not Found Error (404)
 */
export class NotFoundError extends ApiError {
  constructor(message = 'Not Found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict Error (409)
 */
export class ConflictError extends ApiError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

/**
 * Internal Server Error (500)
 */
export class InternalServerError extends ApiError {
  constructor(message = 'Internal Server Error') {
    super(message, 500, 'INTERNAL_ERROR');
    this.name = 'InternalServerError';
  }
}

export default {
  ApiError,
  BadRequestError,
  UnprocessableEntityError,
  TimeoutError,
  NotFoundError,
  ConflictError,
  InternalServerError,
};
