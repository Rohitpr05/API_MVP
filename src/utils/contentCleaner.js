// src/utils/contentCleaner.js
// Utility functions for cleaning and preparing content for LLM extraction

import { UnprocessableEntityError } from './errors.js';

const CODE_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/i;

const extractBalancedJsonSubstring = (text, startIndex) => {
  const openChar = text[startIndex];
  const closeChar = openChar === '{' ? '}' : openChar === '[' ? ']' : null;

  if (!closeChar) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;

      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return null;
};

const removeTrailingCommas = (text) => text.replace(/,\s*([}\]])/g, '$1');

const stripMarkdownCodeFences = (text) => {
  const fencedBlock = text.match(CODE_FENCE_PATTERN);

  if (fencedBlock?.[1]) {
    return fencedBlock[1].trim();
  }

  return text.trim();
};

const extractJsonCandidates = (text) => {
  const candidates = [];
  const seen = new Set();

  const addCandidate = (candidate) => {
    const trimmedCandidate = candidate.trim();

    if (trimmedCandidate && !seen.has(trimmedCandidate)) {
      seen.add(trimmedCandidate);
      candidates.push(trimmedCandidate);
    }
  };

  addCandidate(text);

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char !== '{' && char !== '[') {
      continue;
    }

    const candidate = extractBalancedJsonSubstring(text, index);

    if (candidate) {
      addCandidate(candidate);
    }
  }

  return candidates;
};

const parseJsonCandidate = (candidate) => {
  const trimmedCandidate = candidate.trim();

  if (!trimmedCandidate) {
    throw new UnprocessableEntityError('No JSON content found in extraction response');
  }

  const sanitizedCandidate = removeTrailingCommas(trimmedCandidate);

  const directParsed = JSON.parse(sanitizedCandidate);

  if (typeof directParsed === 'string') {
    const nestedText = directParsed.trim();

    if (nestedText.startsWith('{') || nestedText.startsWith('[')) {
      return parseJsonCandidate(nestedText);
    }

    throw new UnprocessableEntityError('Extraction response contained a JSON string instead of an object');
  }

  if (!directParsed || typeof directParsed !== 'object' || Array.isArray(directParsed)) {
    throw new UnprocessableEntityError('Extraction response did not contain a JSON object');
  }

  return directParsed;
};

/**
 * Normalize a model response into plain text.
 */
export const extractModelResponseText = (response) => {
  if (response == null) {
    return '';
  }

  if (typeof response === 'string') {
    return response;
  }

  if (Array.isArray(response)) {
    return response
      .map((item) => extractModelResponseText(item))
      .filter(Boolean)
      .join('\n');
  }

  if (typeof response === 'object') {
    const contentCandidates = [
      response.content,
      response.text,
      response.message?.content,
      response.choices?.[0]?.message?.content,
      response.output_text,
      response.data,
    ];

    for (const candidate of contentCandidates) {
      const extracted = extractModelResponseText(candidate);
      if (extracted) {
        return extracted;
      }
    }
  }

  return String(response);
};

/**
 * Prepare raw model text for JSON parsing.
 */
export const prepareJsonResponseText = (response) => {
  const rawText = extractModelResponseText(response);
  const withoutFences = stripMarkdownCodeFences(rawText);
  return withoutFences.trim();
};

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
  const schemaJson = JSON.stringify(schema, null, 2);

  const prompt = `Extract structured data from the webpage content.

Rules:
* Return ONLY valid JSON
* Use EXACTLY the schema keys provided
* Do NOT add extra keys
* If a value cannot be found, use null
* Arrays must remain arrays

Schema:
${schemaJson}

Webpage Content:
${content}`;

  return prompt;
};

/**
 * Parse and validate JSON response from LLM
 */
export const parseJsonResponse = (response) => {
  try {
    const responseText = prepareJsonResponseText(response);
    const candidates = extractJsonCandidates(responseText);

    if (candidates.length === 0) {
      throw new UnprocessableEntityError('No JSON found in extraction response');
    }

    let lastError;

    for (const candidate of candidates) {
      try {
        return parseJsonCandidate(candidate);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new UnprocessableEntityError('Extraction response did not contain a valid JSON object');
  } catch (error) {
    if (error instanceof UnprocessableEntityError) {
      throw error;
    }

    throw new UnprocessableEntityError(`Invalid JSON in extraction response: ${error.message}`);
  }
};

/**
 * Validate extracted data against schema and enforce strict conformance
 * - Only keeps schema-defined keys
 * - Sets missing values to null
 * - Coerces types to match schema
 * - Always returns a properly shaped object matching requested schema
 */
export const validateAgainstSchema = (data, schema) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    // If we don't have valid extracted data, return null-filled schema shape
    const nullFilled = {};
    Object.keys(schema).forEach((key) => {
      const type = schema[key];
      if (type === 'array') {
        nullFilled[key] = [];
      } else if (type === 'object') {
        nullFilled[key] = {};
      } else {
        nullFilled[key] = null;
      }
    });
    return nullFilled;
  }

  // Enforce strict schema conformance - ONLY schema keys allowed
  const validated = {};

  Object.entries(schema).forEach(([key, type]) => {
    const value = data[key];

    switch (type) {
      case 'string':
        validated[key] = typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
        break;
      case 'number':
        if (typeof value === 'number') {
          validated[key] = value;
        } else if (typeof value === 'string') {
          const parsed = parseFloat(value);
          validated[key] = !Number.isNaN(parsed) ? parsed : null;
        } else {
          validated[key] = null;
        }
        break;
      case 'boolean':
        if (typeof value === 'boolean') {
          validated[key] = value;
        } else if (typeof value === 'string') {
          validated[key] = value.toLowerCase() === 'true' || value === '1';
        } else {
          validated[key] = null;
        }
        break;
      case 'array':
        validated[key] = Array.isArray(value) ? value : [];
        break;
      case 'object':
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          validated[key] = value;
        } else {
          validated[key] = {};
        }
        break;
      default:
        validated[key] = value ?? null;
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
  extractModelResponseText,
  prepareJsonResponseText,
  parseJsonResponse,
  validateAgainstSchema,
  formatUsageInfo,
};
