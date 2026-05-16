// src/utils/contentCleaner.js
// Utility functions for cleaning and preparing content for LLM extraction

import { ApiError, UnprocessableEntityError, BotProtectionError } from './errors.js';
import { logger } from './logger.js';

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
  logger.debug(
    { schemaKeys: Object.keys(schema || {}), typeofSchema: typeof schema, schemaEmpty: Object.keys(schema || {}).length === 0 },
    'prepareExtractionPrompt received schema (debug)'
  );

  const schemaJson = JSON.stringify(schema, null, 2);

  logger.debug({ schemaJsonLength: schemaJson.length }, 'Schema JSON stringified in prepareExtractionPrompt (debug)');

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

  logger.debug({ promptLength: prompt.length }, 'Final prompt built in prepareExtractionPrompt (debug)');

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

const inferNodeKind = (schemaNode) => {
  if (Array.isArray(schemaNode)) {
    return 'array';
  }

  if (schemaNode === null || schemaNode === undefined) {
    return 'unknown';
  }

  if (typeof schemaNode === 'string') {
    if (['string', 'number', 'boolean', 'array', 'object'].includes(schemaNode)) {
      return schemaNode;
    }

    return 'unknown';
  }

  if (typeof schemaNode === 'object') {
    return 'object';
  }

  return 'unknown';
};

const buildSchemaSkeleton = (schema) => {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return null;
  }

  const skeleton = {};

  Object.entries(schema).forEach(([key, schemaNode]) => {
    const nodeKind = inferNodeKind(schemaNode);

    if (nodeKind === 'object' && schemaNode && !Array.isArray(schemaNode) && Object.keys(schemaNode).length > 0) {
      skeleton[key] = buildSchemaSkeleton(schemaNode);
      return;
    }

    if (nodeKind === 'array') {
      skeleton[key] = [];
      return;
    }

    if (nodeKind === 'object') {
      skeleton[key] = {};
      return;
    }

    skeleton[key] = null;
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

    if (entryValue && typeof entryValue === 'object' && !Array.isArray(entryValue)) {
      return [currentEntry, ...extractCandidateEntries(entryValue, entryPath)];
    }

    return [currentEntry];
  });
};

const describeCandidate = (candidate) => ({
  key: candidate.key,
  path: candidate.path,
  valueType: Array.isArray(candidate.value) ? 'array' : typeof candidate.value,
});

const BOT_PROTECTION_PATTERNS = [
  'just a moment...',
  'checking your browser',
  'verify you are human',
  'cloudflare',
];

const collectTextValues = (value, collected = []) => {
  if (typeof value === 'string') {
    collected.push(value);
    return collected;
  }

  if (!value || typeof value !== 'object') {
    return collected;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectTextValues(item, collected));
    return collected;
  }

  Object.values(value).forEach((item) => collectTextValues(item, collected));
  return collected;
};

const hasBotProtectionSignal = (value) => {
  const textValues = collectTextValues(value);

  return textValues.some((text) => {
    const normalizedText = text.toLowerCase();
    return BOT_PROTECTION_PATTERNS.some((pattern) => normalizedText.includes(pattern));
  });
};

const coerceCandidateValue = (candidateValue, nodeKind) => {
  if (candidateValue === null || candidateValue === undefined) {
    return nodeKind === 'array' ? [] : null;
  }

  switch (nodeKind) {
    case 'array':
      return Array.isArray(candidateValue) ? candidateValue : [];
    case 'object':
      return candidateValue && typeof candidateValue === 'object' && !Array.isArray(candidateValue) ? candidateValue : null;
    case 'boolean':
      if (typeof candidateValue === 'boolean') {
        return candidateValue;
      }

      if (typeof candidateValue === 'string') {
        const normalized = candidateValue.trim().toLowerCase();

        if (['true', '1', 'yes', 'y'].includes(normalized)) {
          return true;
        }

        if (['false', '0', 'no', 'n'].includes(normalized)) {
          return false;
        }
      }

      if (typeof candidateValue === 'number') {
        return candidateValue !== 0;
      }

      return null;
    case 'number':
      if (typeof candidateValue === 'number' && Number.isFinite(candidateValue)) {
        return candidateValue;
      }

      if (typeof candidateValue === 'string') {
        const parsed = Number.parseFloat(candidateValue);
        return Number.isNaN(parsed) ? null : parsed;
      }

      return null;
    case 'string':
    case 'unknown':
    default:
      if (typeof candidateValue === 'string') {
        const trimmed = candidateValue.trim();
        return trimmed.length > 0 ? trimmed : null;
      }

      if (typeof candidateValue === 'number' || typeof candidateValue === 'boolean') {
        return String(candidateValue);
      }

      return candidateValue && typeof candidateValue === 'object' ? null : candidateValue ?? null;
  }
};

const scoreCandidateMatch = (schemaKey, nodeKind, candidate) => {
  const candidateValueType = Array.isArray(candidate.value) ? 'array' : typeof candidate.value;

  if (nodeKind === 'array' && candidateValueType !== 'array') {
    return { score: 0, reason: 'expected array but candidate value is not an array' };
  }

  if (nodeKind === 'object' && (candidateValueType !== 'object' || candidate.value === null || Array.isArray(candidate.value))) {
    return { score: 0, reason: 'expected object but candidate value is not an object' };
  }

  if ((nodeKind === 'string' || nodeKind === 'number' || nodeKind === 'boolean') && candidateValueType === 'object') {
    return { score: 0, reason: `expected ${nodeKind} but candidate value is an object` };
  }

  const schemaNormalized = normalizeKey(schemaKey);
  const candidateNormalized = normalizeKey(candidate.key);
  const candidatePathNormalized = normalizeKey(candidate.path);

  if (candidateNormalized === schemaNormalized || candidatePathNormalized === schemaNormalized) {
    return { score: 100, reason: 'exact match' };
  }

  const schemaGroup = getSemanticGroup(schemaKey);
  const candidateGroup = getSemanticGroup(candidate.key);

  if (schemaGroup && candidateGroup && schemaGroup === candidateGroup) {
    return { score: 90, reason: `semantic group match (${schemaGroup})` };
  }

  const schemaTokens = new Set(tokenizeKey(schemaKey).map(normalizeKey));
  const candidateTokens = tokenizeKey(candidate.key).map(normalizeKey);
  const overlapCount = candidateTokens.filter((token) => schemaTokens.has(token)).length;

  if (overlapCount > 0) {
    const overlapScore = overlapCount / Math.max(schemaTokens.size, candidateTokens.length, 1);
    return { score: 70 + overlapScore * 20, reason: 'token overlap match' };
  }

  if (candidateNormalized.includes(schemaNormalized) || schemaNormalized.includes(candidateNormalized)) {
    return { score: 75, reason: 'substring match' };
  }

  return { score: 0, reason: 'no confident match' };
};

const selectCandidateForField = ({ schemaKey, nodeKind, candidates, usedPaths, fieldPath }) => {
  const availableCandidates = candidates.filter((candidate) => !usedPaths.has(candidate.path));

  logger.info(
    {
      schemaKey,
      fieldPath,
      nodeKind,
      candidateKeys: availableCandidates.map(describeCandidate),
    },
      'Schema normalization candidate keys discovered (debug)'
  );

  let bestCandidate = null;
  let bestScore = 0;

  availableCandidates.forEach((candidate) => {
    const match = scoreCandidateMatch(schemaKey, nodeKind, candidate);

    if (match.score <= 0) {
      logger.debug({ schemaKey, fieldPath, candidate: describeCandidate(candidate), reason: match.reason }, 'Schema normalization candidate rejected (debug)');
      return;
    }

    logger.debug({ schemaKey, fieldPath, candidate: describeCandidate(candidate), score: match.score, reason: match.reason }, 'Schema normalization candidate scored (debug)');

    if (match.score > bestScore) {
      bestScore = match.score;
      bestCandidate = candidate;
    }
  });

  if (!bestCandidate || bestScore < 70) {
    logger.debug({ schemaKey, fieldPath, nodeKind, bestScore }, 'Schema normalization found no confident candidate (debug)');

    return null;
  }

    logger.debug({ schemaKey, fieldPath, chosenMappingKey: bestCandidate.key, score: bestScore }, 'Schema normalization candidate selected (debug)');

  return bestCandidate;
};

const normalizeSchemaNode = (schemaNode, data, candidates, usedPaths, fieldPath = '') => {
  const nodeKind = inferNodeKind(schemaNode);

  logger.debug({ fieldPath, nodeKind }, 'Schema normalization processing field (debug)');

  if (nodeKind === 'object' && schemaNode && !Array.isArray(schemaNode) && Object.keys(schemaNode).length > 0) {
    const normalizedObject = {};

    Object.entries(schemaNode).forEach(([childKey, childSchema]) => {
      const childPath = fieldPath ? `${fieldPath}.${childKey}` : childKey;
      normalizedObject[childKey] = normalizeSchemaNode(childSchema, data, candidates, usedPaths, childPath);
    });

    return normalizedObject;
  }

  if (nodeKind === 'object') {
    logger.debug({ fieldPath, schemaKey: fieldPath.split('.').at(-1) || fieldPath, fallback: {} }, 'Schema normalization using empty object fallback (debug)');

    return {};
  }

  const schemaKey = fieldPath.split('.').at(-1) || fieldPath;
  const selectedCandidate = selectCandidateForField({ schemaKey, nodeKind, candidates, usedPaths, fieldPath });

  if (!selectedCandidate) {
    const fallback = nodeKind === 'array' ? [] : null;

    logger.debug({ fieldPath, schemaKey, fallback }, 'Schema normalization using fallback value (debug)');

    return fallback;
  }

  usedPaths.add(selectedCandidate.path);
  const normalizedValue = coerceCandidateValue(selectedCandidate.value, nodeKind);

  logger.debug({ fieldPath, schemaKey, chosenMappingKey: selectedCandidate.key, chosenMappingPath: selectedCandidate.path, normalizedValue }, 'Schema normalization field mapped (debug)');

  return normalizedValue;
};

/**
 * Normalize extracted data against the requested schema shape.
 * Preserves only schema-approved keys, performs exact/case-insensitive/semantic matching,
 * and fills missing fields with null or [] depending on the requested type.
 */
export const validateAgainstSchema = (data, schema) => {
  // Detailed entry trace
  logger.debug({ typeofSchema: typeof schema, isArraySchema: Array.isArray(schema), schemaKeys: Object.keys(schema || {}), parsedJsonKeys: Object.keys(data || {}) }, 'Schema normalization input (debug)');

  if (hasBotProtectionSignal(data)) {
    logger.warn({ requestedSchema: schema, parsedJson: data }, 'Target site is protected by anti-bot systems');

    throw new BotProtectionError();
  }

  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    logger.debug({ requestedSchema: schema }, 'Schema normalization aborted because requested schema is invalid (debug)');
    return null;
  }

  const candidates = extractCandidateEntries(data);
  const usedPaths = new Set();

  logger.debug({ candidateKeys: candidates.map(describeCandidate) }, 'Schema normalization candidate discovery complete (debug)');

  if (candidates.length === 0) {
    const skeleton = buildSchemaSkeleton(schema);
    logger.debug({ finalNormalizedObject: skeleton }, 'Schema normalization final object before return (debug)');
    return skeleton;
  }

  const normalized = {};

  // Walk each requested schema field and log decisions
  Object.entries(schema).forEach(([key, schemaNode]) => {
    logger.debug({ fieldBeingProcessed: key, parsedJsonKeys: Object.keys(data || {}) }, 'Processing schema field (debug)');
    normalized[key] = normalizeSchemaNode(schemaNode, data, candidates, usedPaths, key);
    logger.debug({ field: key }, 'Field mapping result (debug)');
  });

  logger.debug({ finalNormalizedObject: normalized }, 'Schema normalization final object before return (debug)');

  if (normalized && Object.keys(normalized).length === 0 && data && Object.keys(data).length > 0) {
    logger.warn({ parsedJson: data, schema, finalNormalizedObject: normalized }, 'Normalization collapsed unexpectedly');
  }

  const exactReturnedObject = normalized;

  logger.debug({ exactReturnedObject }, 'Schema normalization exact return object (debug)');

  return exactReturnedObject;
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
