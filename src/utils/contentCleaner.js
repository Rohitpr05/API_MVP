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

const SEMANTIC_KEY_GROUPS = [
  ['companyname', 'company', 'businessname', 'business', 'brandname', 'brand', 'organization', 'organisation'],
  ['mainheadline', 'headline', 'title', 'heroheadline', 'tagline', 'subtitle', 'summary'],
  ['services', 'service', 'features', 'feature', 'offerings', 'offering', 'solutions', 'solution', 'capabilities', 'capability', 'products', 'product'],
  ['pricing', 'price', 'prices', 'plan', 'plans', 'cost', 'costs', 'rate', 'rates'],
  ['timeline', 'timelines', 'schedule', 'roadmap', 'milestone', 'milestones', 'phase', 'phases'],
  ['description', 'desc', 'overview', 'about', 'intro', 'introduction'],
];

const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const tokenizeKey = (value) =>
  String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];

const getSemanticGroup = (value) => {
  const normalized = normalizeKey(value);
  const tokens = tokenizeKey(value).map(normalizeKey);

  for (const group of SEMANTIC_KEY_GROUPS) {
    if (group.includes(normalized)) {
      return group[0];
    }

    if (tokens.some((token) => group.includes(token))) {
      return group[0];
    }
  }

  return null;
};

const buildSchemaSkeleton = (schema) => {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return null;
  }

  const skeleton = {};

  Object.entries(schema).forEach(([key, schemaNode]) => {
    if (schemaNode && typeof schemaNode === 'object' && !Array.isArray(schemaNode)) {
      skeleton[key] = buildSchemaSkeleton(schemaNode);
      return;
    }

    switch (schemaNode) {
      case 'array':
        skeleton[key] = [];
        break;
      case 'object':
        skeleton[key] = null;
        break;
      default:
        skeleton[key] = null;
    }
  });

  return skeleton;
};

const extractCandidateEntries = (value, path = []) => {
  if (!value || typeof value !== 'object') {
    return [];
  }

  if (Array.isArray(value)) {
    return [
      {
        key: path.at(-1) || '',
        path: path.join('.'),
        value,
      },
    ];
  }

  return Object.entries(value).flatMap(([key, entryValue]) => {
    const entryPath = [...path, key];
    const currentEntry = {
      key,
      path: entryPath.join('.'),
      value: entryValue,
    };

    if (entryValue && typeof entryValue === 'object') {
      return [currentEntry, ...extractCandidateEntries(entryValue, entryPath)];
    }

    return [currentEntry];
  });
};

const scoreCandidateMatch = (schemaKey, expectedType, candidate) => {
  const candidateValueType = Array.isArray(candidate.value) ? 'array' : typeof candidate.value;

  if (expectedType === 'array' && candidateValueType !== 'array') {
    return 0;
  }

  if (expectedType === 'object' && (candidateValueType !== 'object' || candidate.value === null || Array.isArray(candidate.value))) {
    return 0;
  }

  if (expectedType === 'string' && candidateValueType === 'object') {
    return 0;
  }

  if (expectedType === 'number' && candidateValueType === 'object') {
    return 0;
  }

  if (expectedType === 'boolean' && candidateValueType === 'object') {
    return 0;
  }

  const schemaNormalized = normalizeKey(schemaKey);
  const candidateNormalized = normalizeKey(candidate.key);
  const candidatePathNormalized = normalizeKey(candidate.path);

  if (candidateNormalized === schemaNormalized || candidatePathNormalized === schemaNormalized) {
    return 100;
  }

  const schemaGroup = getSemanticGroup(schemaKey);
  const candidateGroup = getSemanticGroup(candidate.key);

  if (schemaGroup && candidateGroup && schemaGroup === candidateGroup) {
    return 90;
  }

  const schemaTokens = new Set(tokenizeKey(schemaKey).map(normalizeKey));
  const candidateTokens = tokenizeKey(candidate.key).map(normalizeKey);
  const overlapCount = candidateTokens.filter((token) => schemaTokens.has(token)).length;

  if (overlapCount > 0) {
    const overlapScore = overlapCount / Math.max(schemaTokens.size, candidateTokens.length, 1);
    return 70 + overlapScore * 20;
  }

  if (candidateNormalized.includes(schemaNormalized) || schemaNormalized.includes(candidateNormalized)) {
    return 75;
  }

  return 0;
};

const coerceValueToType = (value, expectedType) => {
  if (value === null || value === undefined) {
    return null;
  }

  switch (expectedType) {
    case 'string':
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }

      return null;
    case 'number':
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isNaN(parsed) ? null : parsed;
      }

      return null;
    case 'boolean':
      if (typeof value === 'boolean') {
        return value;
      }

      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y'].includes(normalized)) {
          return true;
        }

        if (['false', '0', 'no', 'n'].includes(normalized)) {
          return false;
        }
      }

      if (typeof value === 'number') {
        return value !== 0;
      }

      return null;
    case 'array':
      return Array.isArray(value) ? value : [];
    case 'object':
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    default:
      return value ?? null;
  }
};

const pickBestCandidate = (schemaKey, expectedType, candidates, usedPaths) => {
  let bestCandidate = null;
  let bestScore = 0;

  candidates.forEach((candidate) => {
    if (usedPaths.has(candidate.path)) {
      return;
    }

    const score = scoreCandidateMatch(schemaKey, expectedType, candidate);

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  });

  if (bestScore < 70) {
    return null;
  }

  return bestCandidate;
};

const normalizeSchemaNode = (schemaNode, candidates, usedPaths, schemaKey = '') => {
  if (typeof schemaNode === 'string') {
    const candidate = pickBestCandidate(schemaKey, schemaNode, candidates, usedPaths);

    if (!candidate) {
      return schemaNode === 'array' ? [] : null;
    }

    usedPaths.add(candidate.path);
    return coerceValueToType(candidate.value, schemaNode);
  }

  if (schemaNode && typeof schemaNode === 'object' && !Array.isArray(schemaNode)) {
    const normalizedObject = {};

    Object.entries(schemaNode).forEach(([childKey, childSchema]) => {
      normalizedObject[childKey] = normalizeSchemaNode(childSchema, candidates, usedPaths, childKey);
    });

    return normalizedObject;
  }

  return null;
};

/**
 * Normalize extracted data against the requested schema shape.
 * Preserves only schema-approved keys, performs exact/case-insensitive/semantic matching,
 * and fills missing fields with null or [] depending on the requested type.
 */
export const validateAgainstSchema = (data, schema) => {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return null;
  }

  const candidates = extractCandidateEntries(data);
  const usedPaths = new Set();

  if (candidates.length === 0) {
    return buildSchemaSkeleton(schema);
  }

  return normalizeSchemaNode(schema, candidates, usedPaths);
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
