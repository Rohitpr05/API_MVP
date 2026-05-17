import { extractFromUrl } from '../src/services/extraction.service.js';

const sites = [
  'https://novares.in',
  'https://www.apple.com/iphone-16',
  'https://github.com',
];

const schema = {
  title: 'string',
  description: 'string',
};

const run = async () => {
  for (const site of sites) {
    const start = Date.now();
    console.log(`\n--- Extracting ${site}`);
    try {
      const result = await extractFromUrl({
        url: site,
        schema,
        options: {
          timeout: 30000,
          maxTokens: 500,
        },
      });
      const duration = Date.now() - start;
      console.log(`Site: ${site}`);
      console.log(`Extraction method: ${result.extractionMethod}`);
      console.log(`Source title: ${result.source?.title || ''}`);
      console.log(`Content length: ${JSON.stringify(result.data || {}).length}`);
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
