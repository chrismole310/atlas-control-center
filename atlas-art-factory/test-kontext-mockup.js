'use strict';

/**
 * Test: Generate a single Kontext room mockup for the elephant artwork.
 * Run: node test-kontext-mockup.js
 *
 * Uses FLUX.1 Kontext Dev to place the artwork into a living room scene.
 * Output → storage/mockups/kontext-test_living-room.png
 */

require('dotenv').config();
const path = require('path');
const { execSync } = require('child_process');
const { placeArtInRoom } = require('./engines/5-mockup-generation/art-placer');

const ARTWORK = path.join(__dirname, 'storage/artworks/test-output.png');

async function main() {
  console.log('🏠 Kontext Room Mockup Test');
  console.log('   Artwork:', ARTWORK);
  console.log('   Using FLUX.1 Kontext Dev on Replicate\n');

  const start = Date.now();

  // Test just the living room first — takes ~20-30s on Replicate
  const result = await placeArtInRoom(ARTWORK, 'living-room', {
    outputId: 'kontext-test_living-room',
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✅ Done in ${elapsed}s`);
  console.log('   Output:', result.file_path);
  console.log('   Size:', result.width, '×', result.height);

  // Open result
  try { execSync(`open "${result.file_path}"`); } catch(e) {}
  console.log('\n👀 Image opened — how does it look?');
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
