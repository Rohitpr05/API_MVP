import fs from 'fs';
import path from 'path';
import { extractPageContent } from '../src/services/browser.service.js';

const sites = [
  'https://novares.in',
  'https://www.apple.com/iphone-16',
  'https://github.com',
];

const run = async () => {
  for (const site of sites) {
    const start = Date.now();
    console.log(`\n--- Fetching ${site}`);
    try {
      const result = await extractPageContent(site, 15000, 200000);
      const duration = Date.now() - start;
      console.log(`Site: ${site}`);
      console.log(`Title: ${result.title}`);
      console.log(`Content length: ${result.content.length}`);
      console.log(`Duration ms (total): ${duration}`);
    } catch (e) {
      console.error(`Error fetching ${site}:`, e.message);
    }
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
