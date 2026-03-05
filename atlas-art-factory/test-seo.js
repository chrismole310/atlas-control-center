'use strict';

/**
 * SEO smoke test — generates title, description, and tags for the test image.
 * Run: node test-seo.js
 */

require('dotenv').config();
const { generateTitle, generateDescription, optimizeTags } = require('./engines/distribution/seo-optimizer');

const MOCK_ARTWORK = {
  id: 1,
  title: 'Test Artwork',
  prompt: 'cute baby elephant sitting in a field of flowers, soft watercolor style, pastel colors, nursery art, white background, minimal, elegant',
};

const MOCK_SILO = {
  id: 1,
  name: 'nursery-art',
};

async function main() {
  console.log('🔍 Atlas Art Factory — SEO Test');
  console.log('Artwork :', MOCK_ARTWORK.prompt.slice(0, 60) + '...');
  console.log('Silo    :', MOCK_SILO.name);
  console.log('');

  // 1. Title
  console.log('⏳ Generating title...');
  const title = await generateTitle({ artwork: MOCK_ARTWORK, silo: MOCK_SILO });
  console.log('✅ Title:', title);
  console.log('   Characters:', title.length, '/ 140');
  console.log('');

  // 2. Description
  console.log('⏳ Generating description...');
  const description = await generateDescription({
    artwork: { ...MOCK_ARTWORK, title },
    silo: MOCK_SILO,
  });
  console.log('✅ Description (' + description.length + ' chars):');
  console.log('---');
  console.log(description.slice(0, 400) + '...');
  console.log('---');
  console.log('');

  // 3. Tags (no DB needed — falls back to prompt keywords + generic tags)
  console.log('⏳ Generating tags...');
  const tags = await optimizeTags({ siloId: 1, artwork: MOCK_ARTWORK });
  console.log('✅ Tags (' + tags.length + '/13):', tags.join(', '));
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
