// src/services/browser.service.js
// Browser automation using Playwright for webpage extraction

import { chromium } from 'playwright';
import { config } from '../config/env.js';
import { BadRequestError, InternalServerError, TimeoutError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { assertSafeHttpUrl } from '../utils/urlSafety.js';

const NETWORK_IDLE_TIMEOUT = 5000;

// Simple local timeout helper (kept here to avoid cross-file deps)
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

// Persistent browser instance for reuse across requests
let browserInstance = null;

const getBrowser = async () => {
  if (browserInstance) {
    return browserInstance;
  }

  browserInstance = await chromium.launch({
    headless: true,
    timeout: config.browserLaunchTimeout,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  // Monitor for disconnects/crashes and reset singleton
  try {
    browserInstance.on('disconnected', () => {
      logger.warn('Persistent browser disconnected; will relaunch on next request');
      browserInstance = null;
    });
  } catch (e) {
    logger.debug({ err: e.message }, 'Failed to attach disconnected listener (debug)');
  }

  return browserInstance;
};

/**
 * Extract webpage content using Playwright
 *
 * @param {string} url - URL to visit
 * @param {number} timeout - Timeout in milliseconds (default: 20s)
 * @returns {Promise<{title: string, content: string, url: string}>}
 */
export const extractPageContent = async (
  url,
  timeout = config.pageGotoTimeout,
  maxContentLength = config.extractionMaxContentLength
) => {
  let browser = null;
  let context = null;
  let page = null;

  try {
    const safeUrl = await assertSafeHttpUrl(url);

    logger.info({ url: safeUrl.href }, 'Starting browser extraction');

    // Acquire persistent browser instance
    browser = await getBrowser();

    // Create isolated context per request
    context = await browser.newContext();
    page = await context.newPage();

    // Apply aggressive resource blocking to reduce load
    try {
      await page.route('**/*', (route) => {
        try {
          const req = route.request();
          const type = req.resourceType();

          if (['image', 'media', 'font', 'websocket', 'manifest', 'ping', 'stylesheet'].includes(type)) {
            return route.abort();
          }
        } catch (e) {
          // If route.request() fails for some requests, continue them
        }

        return route.continue();
      });
    } catch (e) {
      logger.debug({ error: e.message }, 'Failed to attach route handler (debug)');
    }

    // Use more aggressive navigation timeout to fail fast
    const navigationTimeout = Math.min(timeout, 15000);
    page.setDefaultTimeout(navigationTimeout);
    page.setDefaultNavigationTimeout(navigationTimeout);

    // Navigate to URL (wait for DOMContentLoaded only)
    logger.debug({ url: safeUrl.href }, 'Navigating to URL');
    const gotoStart = Date.now();
    await page.goto(safeUrl.href, {
      waitUntil: 'domcontentloaded',
      timeout: navigationTimeout,
    });
    const gotoMs = Date.now() - gotoStart;
    logger.info({ step: 'page_goto', durationMs: gotoMs }, 'Performance timing');

    // Extract page title
    const title = await page.title();

    // Extract visible text content (with 10s safety timeout)
    const domStart = Date.now();
    const domExtractionPromise = page.evaluate(() => {
      // Remove script and style elements
      const scripts = document.querySelectorAll('script, style, noscript');
      scripts.forEach((el) => el.remove());

      // Get all text content
      let text = document.body.innerText || document.body.textContent || '';

      // Clean up whitespace
      text = text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join('\n');

      return text;
    });

    // Race DOM extraction against a 10s timeout for fallback
    let content;
    try {
      content = await withTimeout(domExtractionPromise, 10000, 'DOM extraction exceeded 10s');
    } catch (domErr) {
      const domMs = Date.now() - domStart;
      logger.warn({ error: domErr.message, durationMs: domMs }, 'DOM extraction timed out, falling back to fetch-based extraction');

      // Lightweight fetch + HTML text fallback
      try {
        const fetchStart = Date.now();
        const resp = await fetch(safeUrl.href, { method: 'GET' });
        const html = await resp.text();
        // Minimal HTML to text conversion: remove scripts/styles and tags
        const stripped = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
          .replace(/<!--([\s\S]*?)-->/g, '')
          .replace(/<[^>]+>/g, '\n')
          .replace(/\n\s+\n/g, '\n')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .join('\n');

        content = stripped.substring(0, maxContentLength);
        const fetchMs = Date.now() - fetchStart;
        logger.info({ step: 'fallback_fetch', durationMs: fetchMs }, 'Performance timing');
      } catch (fetchErr) {
        logger.error({ error: fetchErr.message }, 'Fallback fetch failed');
        throw fetchErr;
      }
    }

    const domMs = Date.now() - domStart;
    logger.info({ step: 'dom_extraction', durationMs: domMs }, 'Performance timing');

    // Limit content length
    let trimmedContent = content.substring(0, maxContentLength);
    if (content.length > maxContentLength) {
      logger.warn(
        { url: safeUrl.href, contentLength: content.length, maxContentLength },
        'Content truncated to protect token usage'
      );
      trimmedContent += '\n... [content truncated]';
    }

    logger.info(
      { url: safeUrl.href, contentLength: trimmedContent.length, title },
      'Content extracted successfully'
    );

    return {
      title,
      content: trimmedContent,
      url,
      extractedAt: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = error?.message || '';

    logger.error(
      { error: errorMessage, url },
      'Browser extraction failed'
    );

    // Provide helpful error messages
    if (errorMessage.includes('net::ERR_NAME_NOT_RESOLVED')) {
      throw new BadRequestError(`Invalid URL or DNS resolution failed: ${url}`);
    }
    if (errorMessage.includes('Timeout') || error?.name === 'TimeoutError') {
      throw new TimeoutError(`Page load timeout (${timeout}ms): ${url}`);
    }
    if (errorMessage.includes('ERR_INVALID_URL')) {
      throw new BadRequestError(`Invalid URL format: ${url}`);
    }
    if (errorMessage.includes('Failed to launch') || errorMessage.includes('executable')) {
      throw new InternalServerError('Chromium failed to launch. Verify Playwright installation and Chromium settings.');
    }

    throw error;
  } finally {
    // Close page/context but keep persistent browser running
    if (page) {
      try {
        await page.close();
      } catch (e) {
        logger.warn({ error: e.message }, 'Failed to close page');
      }
    }

    if (context) {
      try {
        await context.close();
      } catch (e) {
        logger.warn({ error: e.message }, 'Failed to close context');
      }
    }
  }
};

/**
 * Extract structured data from page using JavaScript evaluation
 *
 * @param {string} url - URL to visit
 * @param {object} selectors - CSS selectors to extract
 * @returns {Promise<object>}
 */
export const extractBySelectors = async (url, selectors = {}) => {
  let browser;
  let page;

  try {
    const safeUrl = await assertSafeHttpUrl(url);

    logger.info({ url: safeUrl.href, selectors }, 'Starting selector-based extraction');

    browser = await chromium.launch({
      headless: true,
      timeout: config.browserLaunchTimeout,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    page = await browser.newPage();

    page.setDefaultTimeout(config.pageGotoTimeout);
    page.setDefaultNavigationTimeout(config.pageGotoTimeout);

    await page.goto(safeUrl.href, {
      waitUntil: 'domcontentloaded',
      timeout: config.pageGotoTimeout,
    });

    // Extract data based on selectors
    const data = await page.evaluate((selectorsMap) => {
      const result = {};

      Object.entries(selectorsMap).forEach(([key, selector]) => {
        try {
          const element = document.querySelector(selector);
          result[key] = element ? element.innerText : null;
        } catch (e) {
          result[key] = null;
        }
      });

      return result;
    }, selectors);

    logger.info({ url: safeUrl.href }, 'Selector extraction completed');

    return data;
  } catch (error) {
    const errorMessage = error?.message || '';

    logger.error(
      { error: errorMessage, url },
      'Selector extraction failed'
    );
    throw error;
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {
        logger.warn({ error: e.message }, 'Failed to close page');
      }
    }

    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        logger.warn({ error: e.message }, 'Failed to close browser');
      }
    }
  }
};

export default {
  extractPageContent,
  extractBySelectors,
};
