// src/config/env.js
// Environment variable configuration - RapidAPI marketplace version

import dotenv from 'dotenv';

dotenv.config();

const timeoutMs = Number(process.env.EXTRACTION_TIMEOUT || 45000);

const requiredEnvVars = [
  'NODE_ENV',
  'PORT',
  'RAPIDAPI_PROXY_SECRET',
  'OPENROUTER_API_KEY',
];

// Validate required environment variables
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(', ')}`
  );
}

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  appName: process.env.APP_NAME || 'JSON Extraction API',
  appVersion: process.env.APP_VERSION || '1.0.0',
  publicApiBaseUrl: process.env.PUBLIC_API_BASE_URL || '',

  // RapidAPI
  rapidapiProxySecret: process.env.RAPIDAPI_PROXY_SECRET,

  // OpenRouter
  openrouterApiKey: process.env.OPENROUTER_API_KEY,
  openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  openrouterTimeout: parseInt(process.env.OPENROUTER_TIMEOUT || '10000', 10),

  // Browser / extraction safety
  browserLaunchTimeout: parseInt(process.env.BROWSER_LAUNCH_TIMEOUT || '10000', 10),
  pageGotoTimeout: parseInt(process.env.PAGE_GOTO_TIMEOUT || '10000', 10),

  // Extraction settings
  extractionTimeout: timeoutMs,
  // Maximum characters to keep from extracted page content before sending to LLM
  extractionMaxContentLength: parseInt(process.env.MAX_CONTENT_CHARS || process.env.EXTRACTION_MAX_CONTENT || '12000', 10),
  defaultExtractionModel: process.env.EXTRACTION_MODEL || 'openai/gpt-4o-mini',

  // Production tunables (configurable via environment)
  rateLimitPerMinute: parseInt(process.env.RATE_LIMIT || '60', 10),
  maxSchemaDepth: parseInt(process.env.MAX_SCHEMA_DEPTH || '6', 10),
  maxSchemaKeys: parseInt(process.env.MAX_SCHEMA_KEYS || '100', 10),
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || String(timeoutMs), 10),

  // Feature flags
  isDevelopment: process.env.NODE_ENV !== 'production',
  isProduction: process.env.NODE_ENV === 'production',
};

export default config;
