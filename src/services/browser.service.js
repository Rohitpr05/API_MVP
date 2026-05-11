// src/services/browser.service.js
// Browser automation using Playwright for webpage extraction

import { chromium } from 'playwright';
import { config } from '../config/env.js';
import { BadRequestError, InternalServerError, TimeoutError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { assertSafeHttpUrl } from '../utils/urlSafety.js';

const NETWORK_IDLE_TIMEOUT = 5000;

const resolveChromiumExecutablePath = () => {
  if (!config.chromiumPath) {
    return undefined;
  }

  return config.chromiumPath;
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
  let browser;
  let page;

  try {
    const safeUrl = await assertSafeHttpUrl(url);

    logger.info({ 
        url: safeUrl.href }, 'Starting browser extraction');

    // Launch headless browser
    browser = await chromium.launch({
      headless: true,
      executablePath: resolveChromiumExecutablePath(),
      timeout: config.browserLaunchTimeout,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    // Create new page
    page = await browser.newPage();

    // Set timeout
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);

    // Navigate to URL
    logger.debug({ url: safeUrl.href }, 'Navigating to URL');
    await page.goto(safeUrl.href, {
      waitUntil: 'domcontentloaded', // Wait for DOM to load
      timeout,
    });

    // Wait for network to be idle (max 5 seconds)
    try {
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT });
    } catch (e) {
      logger.warn({ error: e.message }, 'Network idle timeout (continuing)');
    }

    // Extract page title
    const title = await page.title();

    // Extract visible text content
    const content = await page.evaluate(() => {
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
    // Clean up browser resources
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
      executablePath: resolveChromiumExecutablePath(),
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
