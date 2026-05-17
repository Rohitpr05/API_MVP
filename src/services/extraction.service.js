// src/services/extraction.service.js
// JSON extraction business logic with real OpenRouter integration
// RapidAPI marketplace version - no user tracking

import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { extractPageContent } from './browser.service.js';
import { extractFastPageContent } from './fastExtraction.service.js';
import {
  cleanContent,
  dedupeContent,
  reduceContent,
  prepareExtractionPrompt,
  extractModelResponseText,
  prepareJsonResponseText,
  parseJsonResponse,
  validateAgainstSchema,
  formatUsageInfo,
} from '../utils/contentCleaner.js';
import { config } from '../config/env.js';
import { BadRequestError, InternalServerError, TimeoutError, UnprocessableEntityError } from '../utils/errors.js';

const withTimeout = async (promise, timeoutMs, message) => {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

const truncateForLog = (value, maxLength = 8000) => {
  if (typeof value !== 'string') {
    return value;
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n... [truncated]`;
};

// Initialize OpenRouter client
const openrouter = new OpenAI({
  apiKey: config.openrouterApiKey,
  baseURL: config.openrouterBaseUrl,
  timeout: config.openrouterTimeout,
  maxRetries: 0,
  defaultHeaders: {
    'HTTP-Referer': config.appName,
    'X-Title': config.appName,
  },
});

/**
 * Extract structured data from URL using Playwright + OpenRouter
 *
 * @param {object} extractionData - {url, schema, options}
 * @returns {Promise<object>} - Extraction result
 */
export const extractFromUrl = async (extractionData) => {
  const extractionId = `ext_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startedAt = Date.now();
  const start = Date.now();

  try {
    const { url, schema, options = {} } = extractionData;
    const model = options.model || 'openai/gpt-4o-mini';
    const extractionTimeout = options.timeout || config.extractionTimeout;
    const browserTimeout = Math.min(config.pageGotoTimeout, extractionTimeout);
    let extractionMethod = 'fast-html';
    let fastExtractionResult = null;
    let pageData = null;
    let fallbackLogged = false;

    logger.info({ extractionId, url }, 'Starting extraction pipeline');

    const result = await withTimeout((async () => {
      // Step 1: Try fast HTML extraction first
      logger.debug({ extractionId }, 'Attempting fast HTML extraction');
      const fastStart = Date.now();

      try {
        fastExtractionResult = await extractFastPageContent(url, config.extractionMaxContentLength);
      } catch (fastError) {
        logger.warn(
          { extractionId, error: fastError.message },
          'Fast extraction failed, falling back to Playwright'
        );
        logger.info({ step: 'fallback_to_playwright' }, 'Performance timing');
        fallbackLogged = true;
      }

      if (fastExtractionResult) {
        const fastDurationMs = Date.now() - fastStart;
        logger.info({ step: 'fast_extraction_result_ready', durationMs: fastDurationMs }, 'Performance timing');
      }

      const usePlaywright = !fastExtractionResult || fastExtractionResult.shouldFallbackToPlaywright;

      if (usePlaywright) {
        if (fastExtractionResult?.fallbackReason) {
          logger.info(
            { step: 'fallback_to_playwright', reason: fastExtractionResult.fallbackReason },
            'Performance timing'
          );
          fallbackLogged = true;
        } else if (!fallbackLogged) {
          logger.info({ step: 'fallback_to_playwright' }, 'Performance timing');
          fallbackLogged = true;
        }

        // Step 1b: Fallback to Playwright extraction only when fast HTML quality is poor
        logger.debug({ extractionId }, 'Fetching page content with Playwright fallback');
        const browserStart = Date.now();
        pageData = await extractPageContent(url, browserTimeout, config.extractionMaxContentLength);
        const browserTotalMs = Date.now() - browserStart;
        logger.info({ step: 'browser_total', durationMs: browserTotalMs }, 'Performance timing');
        extractionMethod = 'playwright';
      } else {
        pageData = {
          url: fastExtractionResult.url,
          title: fastExtractionResult.title,
          content: fastExtractionResult.content,
          extractedAt: fastExtractionResult.extractedAt,
          metadata: fastExtractionResult.metadata,
          description: fastExtractionResult.description,
        };
        extractionMethod = 'fast-html';
      }

      // Log extracted content length
      const originalLength = pageData?.content?.length ?? 0;
      logger.info({ step: 'extracted_content_length', length: originalLength }, 'Performance timing');

      // Step: content cleaning / truncation
      const cleaningStart = Date.now();
      const cleanedContent = cleanContent(pageData.content, config.extractionMaxContentLength);
      const cleaningMs = Date.now() - cleaningStart;
      logger.info({ step: 'content_cleaning', durationMs: cleaningMs }, 'Performance timing');
      logger.info({ step: 'cleaned_content_length', length: cleanedContent.length }, 'Performance timing');

      // Deduplicate and reduce content before sending to LLM
      const dedupeStart = Date.now();
      const deduped = dedupeContent(cleanedContent);
      const dedupeMs = Date.now() - dedupeStart;
      logger.info({ step: 'content_dedup', durationMs: dedupeMs }, 'Performance timing');

      const reduceStart = Date.now();
      const reducedContent = reduceContent(deduped, Math.floor(config.extractionMaxContentLength / 2));
      const reduceMs = Date.now() - reduceStart;
      logger.info({ step: 'content_reduction', durationMs: reduceMs }, 'Performance timing');
      logger.info({ step: 'reduced_content_length', length: reducedContent.length }, 'Performance timing');

      const reductionPct = originalLength > 0 ? Math.round(((originalLength - reducedContent.length) / originalLength) * 100) : 0;
      logger.info({ step: 'content_reduction_pct', percentage: reductionPct }, 'Performance timing');

      // Step 2: Prepare extraction prompt
      logger.debug({ extractionId, schemaKeys: Object.keys(schema || {}) }, 'Preparing prompt (debug)');

      const prompt = prepareExtractionPrompt(reducedContent, schema);

      logger.debug({ extractionId, promptLength: prompt.length }, 'Prompt prepared (debug)');

      // Step 3: Call OpenRouter API
      logger.debug({ extractionId, model }, 'Calling OpenRouter API');
      const openaiStart = Date.now();

      const response = await openrouter.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0,
        max_tokens: options.maxTokens || 1000,
        timeout: extractionTimeout,
      });

      const openaiDuration = Date.now() - openaiStart;
      logger.info({ step: 'openai_request', durationMs: openaiDuration }, 'Performance timing');

      // Step 4: Parse and validate response
      const rawResponseText = extractModelResponseText(response);
      const cleanedResponseText = prepareJsonResponseText(response);

      logger.debug({ extractionId, rawResponseSnippet: truncateForLog(rawResponseText, 2000) }, 'Raw LLM response (debug)');
      logger.debug({ extractionId, cleanedResponseSnippet: truncateForLog(cleanedResponseText, 2000) }, 'Cleaned LLM response (debug)');

      let extractedData;

      // JSON parsing timing
      const parseStart = Date.now();
      try {
        extractedData = parseJsonResponse(cleanedResponseText);
      } catch (parseError) {
        logger.debug({ extractionId, parseError: parseError.message }, 'JSON parse failure (debug)');
        const parseMs = Date.now() - parseStart;
        logger.info({ step: 'json_parsing', durationMs: parseMs }, 'Performance timing');

        throw parseError;
      }
      const parseMs = Date.now() - parseStart;
      logger.info({ step: 'json_parsing', durationMs: parseMs }, 'Performance timing');

      logger.debug({ extractionId, parsedJsonKeys: Object.keys(extractedData || {}) }, 'Parsed JSON object (debug)');

      const validationStart = Date.now();
      const validatedData = validateAgainstSchema(extractedData, schema);
      const validationMs = Date.now() - validationStart;
      logger.info({ step: 'schema_validation', durationMs: validationMs }, 'Performance timing');
      // Always use validated data - strict schema conformance required
      const finalData = validatedData;

      logger.debug({ extractionId, finalDataKeys: Object.keys(finalData || {}) }, 'Final extraction data payload (debug)');

      // Step 5: Format usage info
      const usage = formatUsageInfo(response.usage, model);

      // Final response assembly timing
      const assemblyStart = Date.now();

      const extractionResult = {
        extractionId,
        success: true,
        extractionMethod,
        data: finalData,
        source: {
          url: pageData.url,
          title: pageData.title,
        },
        usage,
        timestamp: new Date().toISOString(),
      };

      const assemblyMs = Date.now() - assemblyStart;
      logger.info({ step: 'final_response_assembly', durationMs: assemblyMs }, 'Performance timing');

      // Log usage and final response size
      logger.info({ step: 'tokens_used', tokens: usage?.tokensUsed ?? 0 }, 'Performance timing');
      try {
        const finalSize = JSON.stringify(extractionResult).length;
        logger.info({ step: 'final_response_size_bytes', size: finalSize }, 'Performance timing');
      } catch (e) {
        logger.debug({ error: e.message }, 'Failed to compute final response size (debug)');
      }

      logger.info(
        {
          step: 'optimization_summary',
          extractionMethod,
          usedFallback: extractionMethod === 'playwright',
          originalLength,
          reducedLength: reducedContent.length,
          reductionPct,
        },
        'Performance timing'
      );

      logger.debug({ extractionId, extractionResultSummary: { extractionId, source: extractionResult.source, timestamp: extractionResult.timestamp } }, 'Final extraction service return value (debug)');

      return extractionResult;
    })(), extractionTimeout, `Extraction timed out after ${extractionTimeout}ms`);

    logger.info(
      { extractionId, durationMs: Date.now() - startedAt, tokensUsed: result.usage.tokensUsed },
      'Extraction completed successfully'
    );

    // Total request duration (from function entry)
    logger.info({ step: 'total_request', durationMs: Date.now() - start }, 'Performance timing');

    return result;
  } catch (error) {
    const errorMessage = error?.message || '';

    logger.error(
      { error: errorMessage, extractionId, durationMs: Date.now() - startedAt },
      'Extraction failed'
    );

    // Provide user-friendly error messages
    if (errorMessage.includes('Invalid URL') || errorMessage.includes('DNS')) {
      throw new BadRequestError(`Invalid URL: ${errorMessage}`);
    }

    if (error instanceof TimeoutError || errorMessage.toLowerCase().includes('timeout')) {
      throw new TimeoutError(errorMessage);
    }

    if (error instanceof UnprocessableEntityError) {
      throw error;
    }

    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      throw new InternalServerError('OpenRouter API authentication failed. Check OPENROUTER_API_KEY.');
    }

    throw error;
  }
};

export default {
  extractFromUrl,
};
