'use strict';

/**
 * Mockup smoke test — composites test-output.png into all 5 room scenes
 * and exports 6 print sizes.
 * Run: node test-mockup.js
 */

require('dotenv').config();
const path = require('path');
const { generateAllMockups } = require('./engines/5-mockup-generation/art-placer');
const { exportAllSizes } = require('./engines/5-mockup-generation/format-optimizer');
const { buildPackage } = require('./engines/5-mockup-generation/package-builder');

// art-placer.generateAllMockups takes a path string, not an artwork object

const MOCK_ARTWORK = {
  id: 1,
  uuid: 'test-001',
  title: 'Baby Elephant Nursery Wall Art',
  master_image_path: path.join(__dirname, 'storage/artworks/test-output.png'),
};

async function main() {
  console.log('🖼️  Atlas Art Factory — Mockup Test');
  console.log('Input :', MOCK_ARTWORK.master_image_path);
  console.log('');

  // 1. Generate room scene mockups
  console.log('⏳ Generating 5 room mockups...');
  const start = Date.now();
  const mockups = await generateAllMockups(MOCK_ARTWORK.master_image_path, { outputPrefix: 'test' });
  console.log(`✅ Mockups (${mockups.length}):`);
  mockups.forEach(m => console.log(`   ${m.template_id.padEnd(12)} → ${path.basename(m.file_path)}`));
  console.log('');

  // 2. Export 6 print sizes
  console.log('⏳ Exporting 6 print sizes...');
  const formats = await exportAllSizes(MOCK_ARTWORK.master_image_path, { artworkId: MOCK_ARTWORK.id });
  console.log(`✅ Formats (${formats.length}):`);
  formats.forEach(f => console.log(`   ${(f.name||f.size||'').padEnd(10)} ${f.width}×${f.height}px → ${path.basename(f.file_path||f.output_path)}`));
  console.log('');

  // 3. Build ZIP package
  console.log('⏳ Building ZIP package...');
  const pkg = await buildPackage({ id: MOCK_ARTWORK.id, title: MOCK_ARTWORK.title }, formats, mockups);
  console.log('✅ Package:');
  console.log('   File      :', path.basename(pkg.zip_path));
  console.log('   Files     :', pkg.file_count);
  console.log('   Size      :', (pkg.size_bytes / 1024 / 1024).toFixed(1) + ' MB');

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('   Time      :', elapsed + 's');
  console.log('');
  console.log('Opening mockups...');
  const { execSync } = require('child_process');
  mockups.slice(0, 2).forEach(m => {
    try { execSync(`open "${m.output_path}"`); } catch(e) {}
  });
}

main().catch(e => { console.error('❌', e.message, e.stack); process.exit(1); });
