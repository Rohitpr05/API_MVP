// src/config/env.js
// Environment variable configuration - RapidAPI marketplace version

import dotenv from 'dotenv';

dotenv.config();

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
  extractionTimeout: parseInt(process.env.EXTRACTION_TIMEOUT || '15000', 10),
  extractionMaxContentLength: parseInt(process.env.EXTRACTION_MAX_CONTENT || '12000', 10),
  defaultExtractionModel: process.env.EXTRACTION_MODEL || 'deepseek/deepseek-chat',

  // Feature flags
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
};

export default config;
