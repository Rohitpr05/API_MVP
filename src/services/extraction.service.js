// src/services/extraction.service.js
// JSON extraction business logic with real OpenRouter integration
// RapidAPI marketplace version - no user tracking

import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { extractPageContent } from './browser.service.js';
import {
  cleanContent,
  prepareExtractionPrompt,
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

  try {
    const { url, schema, options = {} } = extractionData;
    const model = options.model || 'deepseek/deepseek-chat'; // Free/cheap model
    const extractionTimeout = options.timeout || config.extractionTimeout;
    const browserTimeout = Math.min(config.pageGotoTimeout, extractionTimeout);

    logger.info(
      { extractionId, url, model },
      'Starting extraction pipeline'
    );

    const result = await withTimeout((async () => {
      // Step 1: Extract page content using Playwright
      logger.debug({ extractionId }, 'Fetching page content');
      const pageData = await extractPageContent(url, browserTimeout, config.extractionMaxContentLength);
      const cleanedContent = cleanContent(pageData.content, config.extractionMaxContentLength);

      // Step 2: Prepare extraction prompt
      const prompt = prepareExtractionPrompt(cleanedContent, schema);

      // Step 3: Call OpenRouter API
      logger.debug({ extractionId, model }, 'Calling OpenRouter API');
      const startTime = Date.now();

      const response = await openrouter.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0,
        max_tokens: 2000,
        timeout: extractionTimeout,
      });

      const elapsed = Date.now() - startTime;

      logger.debug(
        { extractionId, elapsed, model },
        'OpenRouter response received'
      );

      // Step 4: Parse and validate response
      const responseText = response.choices[0]?.message?.content || '';
      let extractedData = parseJsonResponse(responseText);
      extractedData = validateAgainstSchema(extractedData, schema);

      // Step 5: Format usage info
      const usage = formatUsageInfo(response.usage, model);

      return {
        extractionId,
        success: true,
        data: extractedData,
        source: {
          url: pageData.url,
          title: pageData.title,
        },
        usage,
        timestamp: new Date().toISOString(),
      };
    })(), extractionTimeout, `Extraction timed out after ${extractionTimeout}ms`);

    logger.info(
      { extractionId, durationMs: Date.now() - startedAt, tokensUsed: result.usage.tokensUsed },
      'Extraction completed successfully'
    );

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
