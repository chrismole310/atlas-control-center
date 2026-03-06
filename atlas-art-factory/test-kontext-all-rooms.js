'use strict';

/**
 * Test: Generate all 5 Kontext room mockups for the elephant artwork.
 * Run: node test-kontext-all-rooms.js
 */

require('dotenv').config();
const path = require('path');
const { execSync } = require('child_process');
const { generateAllMockups } = require('./engines/5-mockup-generation/art-placer');

const ARTWORK = path.join(__dirname, 'storage/artworks/test-output.png');

async function main() {
  console.log('🏠 Kontext All-Rooms Mockup Test');
  console.log('   Artwork:', ARTWORK);
  console.log('   Generating 5 rooms via FLUX.1 Kontext Dev...\n');

  const start = Date.now();

  const results = await generateAllMockups(ARTWORK, {
    outputPrefix: 'kontext-test',
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Done in ${elapsed}s — ${results.length}/5 rooms generated`);

  for (const r of results) {
    console.log(`   ${r.template_id}: ${r.file_path}`);
    try { execSync(`open "${r.file_path}"`); } catch(e) {}
  }
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
