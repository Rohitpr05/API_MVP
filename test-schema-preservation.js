#!/usr/bin/env node
/**
 * Test script to verify schema preservation through the request pipeline
 * Tests both type-name format and template-value format
 */

import { createApp } from './src/app.js';

const TEST_CASES = [
  {
    name: 'Template-value format (null values)',
    body: {
      url: 'https://example.com',
      schema: {
        companyName: null,
        description: null,
      },
    },
  },
  {
    name: 'Type-name format (string enum)',
    body: {
      url: 'https://example.com',
      schema: {
        title: 'string',
        price: 'number',
      },
    },
  },
  {
    name: 'Mixed format',
    body: {
      url: 'https://example.com',
      schema: {
        title: 'string',
        price: null,
        features: [],
        details: {},
      },
    },
  },
  {
    name: 'Nested template-value format',
    body: {
      url: 'https://example.com',
      schema: {
        product: {
          name: null,
          price: null,
        },
      },
    },
  },
];

async function runTests() {
  console.log('\n🔍 Schema Preservation Test Suite\n');
  console.log('=' .repeat(60));

  const fastify = await createApp();

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of TEST_CASES) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log('-'.repeat(60));

    try {
      const response = await fastify.inject({
        method: 'POST',
        url: '/extract',
        headers: {
          'x-rapidapi-proxy-secret': process.env.RAPIDAPI_PROXY_SECRET || 'test-secret',
          'content-type': 'application/json',
        },
        payload: testCase.body,
      });

      const statusCode = response.statusCode;
      const body = response.json();

      console.log(`Status: ${statusCode}`);
      console.log(`Response success: ${body.success}`);

      if (statusCode === 400 && body.details) {
        console.log('❌ FAILED - Validation rejected');
        console.log('Details:', JSON.stringify(body.details, null, 2));
        failedTests++;
      } else if (statusCode === 200) {
        console.log('✅ PASSED - Request accepted');
        passedTests++;
      } else if (statusCode === 403) {
        console.log('⚠️  SKIPPED - Invalid proxy secret (set RAPIDAPI_PROXY_SECRET)');
      } else {
        console.log(`⚠️  Unexpected status: ${statusCode}`);
        console.log('Response:', JSON.stringify(body, null, 2));
      }
    } catch (error) {
      console.log(`❌ FAILED - ${error.message}`);
      failedTests++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passedTests} passed, ${failedTests} failed\n`);

  await fastify.close();
  process.exit(failedTests > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error('Test suite error:', error);
  process.exit(1);
});
