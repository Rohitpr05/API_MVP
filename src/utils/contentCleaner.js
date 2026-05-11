// src/utils/contentCleaner.js
// Utility functions for cleaning and preparing content for LLM extraction

import { UnprocessableEntityError } from './errors.js';

/**
 * Clean and normalize content
 */
export const cleanContent = (content, maxLength = 12000) => {
  if (!content) return '';

  let cleaned = content
    // Remove extra whitespace and newlines
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength) + '\n... [truncated]';
  }

  return cleaned;
};

/**
 * Prepare content and schema for LLM extraction prompt
 */
export const prepareExtractionPrompt = (content, schema) => {
  // Build schema description
  const schemaDescription = Object.entries(schema)
    .map(([key, type]) => `  - ${key}: ${type}`)
    .join('\n');

  const prompt = `You are a JSON extraction engine. Extract ONLY the requested fields from the webpage content below.

Return ONLY valid JSON with the exact schema specified. Do not include any explanation or additional text.

SCHEMA:
${schemaDescription}

CONTENT:
${content}

Return ONLY valid JSON matching the schema:`;

  return prompt;
};

/**
 * Parse and validate JSON response from LLM
 */
export const parseJsonResponse = (response) => {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new UnprocessableEntityError('No JSON found in extraction response');
    }

    const json = JSON.parse(jsonMatch[0]);
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new UnprocessableEntityError('Extraction response did not contain a JSON object');
    }
    return json;
  } catch (error) {
    if (error instanceof UnprocessableEntityError) {
      throw error;
    }

    throw new UnprocessableEntityError(`Invalid JSON in extraction response: ${error.message}`);
  }
};

/**
 * Validate extracted data against schema
 */
export const validateAgainstSchema = (data, schema) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new UnprocessableEntityError('Extraction output must be a JSON object');
  }

  const validated = {};

  Object.entries(schema).forEach(([key, type]) => {
    const value = data[key];

    switch (type) {
      case 'string':
        validated[key] = typeof value === 'string' ? value : String(value || '');
        break;
      case 'number':
        validated[key] = typeof value === 'number' ? value : parseFloat(value) || 0;
        break;
      case 'boolean':
        validated[key] =
          typeof value === 'boolean'
            ? value
            : value === 'true' || value === true || value === 1;
        break;
      case 'array':
        validated[key] = Array.isArray(value) ? value : [];
        break;
      case 'object':
        validated[key] = typeof value === 'object' ? value : {};
        break;
      default:
        validated[key] = value;
    }
  });

  return validated;
};

/**
 * Format API usage information
 */
export const formatUsageInfo = (usage, model) => {
  return {
    model: model || 'unknown',
    tokensUsed: usage?.total_tokens || 0,
    inputTokens: usage?.prompt_tokens || 0,
    outputTokens: usage?.completion_tokens || 0,
  };
};

export default {
  cleanContent,
  prepareExtractionPrompt,
  parseJsonResponse,
  validateAgainstSchema,
  formatUsageInfo,
};
