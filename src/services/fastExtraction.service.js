// src/services/fastExtraction.service.js
// Fast HTML extraction using axios + cheerio for low-latency static page parsing

import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger.js';
import { assertSafeHttpUrl } from '../utils/urlSafety.js';
import { TimeoutError } from '../utils/errors.js';

const FAST_REQUEST_TIMEOUT_MS = 8000;
const MIN_CONTENT_LENGTH = 900;
const MIN_MEANINGFUL_TEXT_LENGTH = 500;
const MAX_SCRIPT_RATIO = 0.28;
const MAX_SCRIPT_COUNT = 35;

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const withTimeout = async (promise, timeoutMs, message) => {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new TimeoutError(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

const normalizeText = (text) =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

const extractMetaContent = ($, selectors) => {
  for (const selector of selectors) {
    const value = normalizeText($(selector).first().attr('content'));
    if (value) {
      return value;
    }
  }

  return '';
};

const getTextCandidates = ($) => {
  const candidates = [
    'main',
    'article',
    '[role="main"]',
    '#content',
    '#main',
    '.content',
    '.main',
    'body',
  ];

  const sections = [];

  for (const selector of candidates) {
    const nodes = $(selector);
    if (!nodes.length) {
      continue;
    }

    nodes.each((_, element) => {
      const clone = $(element).clone();
      clone.find('script, style, noscript, nav, footer, header, aside, form, iframe, canvas, svg, link, meta').remove();
      const text = normalizeText(clone.text());

      if (text.length > 0) {
        sections.push(text);
      }
    });
  }

  if (sections.length === 0) {
    const body = $('body').clone();
    body.find('script, style, noscript, nav, footer, header, aside, form, iframe, canvas, svg, link, meta').remove();
    const fallbackText = normalizeText(body.text());
    if (fallbackText) {
      sections.push(fallbackText);
    }
  }

  const deduped = [];
  const seen = new Set();

  for (const section of sections) {
    const key = section.slice(0, 240);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(section);
  }

  return deduped.join('\n');
};

const collectMeaningfulText = (text) =>
  String(text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => line.length > 20)
    .slice(0, 200)
    .join('\n');

const detectJsRenderedSignals = ($, html, textLength, scriptCount, scriptRatio) => {
  const lowerHtml = html.toLowerCase();
  const appShellSignals = [
    'id="__next"',
    'id="__nuxt"',
    'id="root"',
    'id="app"',
    'data-reactroot',
    'ng-app',
    '__astro',
  ];

  const appShellHit = appShellSignals.some((signal) => lowerHtml.includes(signal));
  const sparseText = textLength < MIN_MEANINGFUL_TEXT_LENGTH;
  const manyScripts = scriptCount >= MAX_SCRIPT_COUNT || scriptRatio >= MAX_SCRIPT_RATIO;
  const emptyBody = textLength < 200 && $('body').length > 0;

  return appShellHit || (sparseText && (manyScripts || emptyBody));
};

const buildQualityMetrics = ({ htmlLength, textLength, scriptCount, scriptBytes, title, description, meaningfulText }) => {
  const scriptRatio = htmlLength > 0 ? scriptBytes / htmlLength : 1;
  const hasMeaningfulText = meaningfulText.length >= MIN_MEANINGFUL_TEXT_LENGTH;
  const hasUsefulTitle = Boolean(title && title.length >= 3);
  const qualityScore = [
    hasMeaningfulText,
    hasUsefulTitle,
    description.length > 0,
    textLength >= MIN_CONTENT_LENGTH,
    scriptRatio < MAX_SCRIPT_RATIO,
  ].filter(Boolean).length;

  return {
    htmlLength,
    textLength,
    scriptCount,
    scriptBytes,
    scriptRatio,
    hasMeaningfulText,
    hasUsefulTitle,
    qualityScore,
  };
};

const shouldFallbackToPlaywright = ({ metrics, jsRendered, responseStatus, textLength }) => {
  if (responseStatus && responseStatus >= 400) {
    return { fallback: true, reason: `http_${responseStatus}` };
  }

  if (jsRendered) {
    return { fallback: true, reason: 'js_rendered_signals' };
  }

  if (textLength < MIN_CONTENT_LENGTH) {
    return { fallback: true, reason: 'insufficient_text_length' };
  }

  if (!metrics.hasMeaningfulText) {
    return { fallback: true, reason: 'no_meaningful_text' };
  }

  if (metrics.scriptRatio >= MAX_SCRIPT_RATIO || metrics.scriptCount >= MAX_SCRIPT_COUNT) {
    return { fallback: true, reason: 'script_heavy_page' };
  }

  if (metrics.qualityScore <= 2) {
    return { fallback: true, reason: 'low_quality_score' };
  }

  return { fallback: false, reason: null };
};

/**
 * Fast HTML extraction using axios + cheerio.
 * Returns page content, metadata, and quality diagnostics.
 */
export const extractFastPageContent = async (url, maxContentLength = 12000) => {
  const safeUrl = await assertSafeHttpUrl(url);
  const startedAt = Date.now();

  const response = await withTimeout(
    axios.get(safeUrl.href, {
      timeout: FAST_REQUEST_TIMEOUT_MS,
      responseType: 'text',
      transformResponse: [(data) => data],
      maxRedirects: 5,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      validateStatus: () => true,
    }),
    FAST_REQUEST_TIMEOUT_MS + 1000,
    'Fast extraction timed out'
  );

  const html = typeof response.data === 'string' ? response.data : String(response.data || '');
  const $ = cheerio.load(html, { decodeEntities: true });

  const title = normalizeText($('title').first().text());
  const description = extractMetaContent($, [
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
  ]);

  const scriptNodes = $('script');
  let scriptBytes = 0;
  scriptNodes.each((_, element) => {
    scriptBytes += normalizeText($(element).html()).length;
  });

  const scriptCount = scriptNodes.length;
  const htmlLength = html.length;

  $('script, style, nav, footer, noscript, iframe, svg, canvas, form').remove();

  const structuredText = getTextCandidates($);
  const meaningfulText = collectMeaningfulText(structuredText);

  const contentParts = [];
  if (title) {
    contentParts.push(`Title: ${title}`);
  }
  if (description) {
    contentParts.push(`Description: ${description}`);
  }
  if (meaningfulText) {
    contentParts.push(meaningfulText);
  }

  let content = contentParts.join('\n');
  if (content.length > maxContentLength) {
    content = `${content.slice(0, maxContentLength)}\n... [truncated]`;
  }

  const textLength = content.length;
  const metrics = buildQualityMetrics({
    htmlLength,
    textLength,
    scriptCount,
    scriptBytes,
    title,
    description,
    meaningfulText,
  });

  const jsRendered = detectJsRenderedSignals($, html, textLength, scriptCount, metrics.scriptRatio);
  const fallbackDecision = shouldFallbackToPlaywright({
    metrics,
    jsRendered,
    responseStatus: response.status,
    textLength,
  });

  const durationMs = Date.now() - startedAt;

  logger.info(
    {
      step: 'fast_extraction',
      durationMs,
      url: safeUrl.href,
      status: response.status,
      textLength,
      scriptCount,
      scriptRatio: Number(metrics.scriptRatio.toFixed(3)),
      qualityScore: metrics.qualityScore,
      fallback: fallbackDecision.fallback,
      fallbackReason: fallbackDecision.reason,
    },
    'Performance timing'
  );

  return {
    extractionMethod: 'fast-html',
    url: safeUrl.href,
    title,
    description,
    content,
    metadata: {
      title,
      description,
      contentLength: content.length,
      htmlLength,
      textLength,
      scriptCount,
      scriptBytes,
      scriptRatio: metrics.scriptRatio,
      qualityScore: metrics.qualityScore,
      jsRendered,
      responseStatus: response.status,
    },
    shouldFallbackToPlaywright: fallbackDecision.fallback,
    fallbackReason: fallbackDecision.reason,
    extractedAt: new Date().toISOString(),
  };
};

export default {
  extractFastPageContent,
};
