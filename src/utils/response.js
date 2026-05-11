// src/utils/response.js
// Standard response formatting utility

/**
 * Format a successful response
 */
export const successResponse = (data, message = 'Success', statusCode = 200) => {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Format an error response
 */
export const errorResponse = (error, statusCode = 500) => {
  return {
    success: false,
    message: error.message || 'An error occurred',
    code: error.code || 'ERROR',
    timestamp: new Date().toISOString(),
  };
};

export default {
  successResponse,
  errorResponse,
};
