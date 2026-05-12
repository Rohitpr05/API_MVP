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

  const prompt = `You are a strict JSON extraction engine.

Return ONLY one valid raw JSON object.
Use EXACTLY the schema keys provided below.
Do NOT invent new keys.
Do NOT rename keys.
Do NOT omit keys.
If a scalar value is missing, use null.
If an array field has no items, return an empty array [].
Arrays must remain arrays.
Preserve exact field names.
Do not return markdown.
Do not wrap the answer in code fences.
Do not include explanations, commentary, or prose.
Do not include trailing commas.
Do not return a JSON string.
Begin with { and end with }.

Requested schema:
${schemaJson}

Example:
Requested schema:
{
  "companyName": "string",
  "services": "array"
}

Correct output:
{
  "companyName": "NOVARES",
  "services": ["GST", "MCA"]
}

CONTENT:
${content}

Return ONLY valid JSON matching the schema.`;

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
  extractModelResponseText,
  prepareJsonResponseText,
  parseJsonResponse,
  validateAgainstSchema,
  formatUsageInfo,
};
