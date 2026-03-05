'use strict';

/**
 * Quick smoke test — generates one image via FLUX.1 schnell on Replicate.
 * No DB required. Saves to storage/artworks/test-output.png
 *
 * Run: node test-generate.js
 */

require('dotenv').config();
const { generateFluxSchnell } = require('./engines/4-ai-artist/engines/flux');

const TEST_PROMPT = 'cute baby elephant sitting in a field of flowers, soft watercolor style, pastel colors, nursery art, white background, minimal, elegant';

async function main() {
  console.log('🎨 Atlas Art Factory — Test Generation');
  console.log('Engine : FLUX.1 schnell (Replicate)');
  console.log('Prompt :', TEST_PROMPT);
  console.log('');

  if (!process.env.REPLICATE_API_TOKEN) {
    console.error('❌ REPLICATE_API_TOKEN not set in .env');
    process.exit(1);
  }

  console.log('⏳ Generating image... (usually 10-20 seconds)');
  const start = Date.now();

  try {
    const result = await generateFluxSchnell(TEST_PROMPT, {
      outputId: 'test-output',
      aspectRatio: '2:3',
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log('');
    console.log('✅ Success!');
    console.log('   File   :', result.file_path);
    console.log('   Engine :', result.engine);
    console.log('   Size   :', result.width, '×', result.height);
    console.log('   Time   :', elapsed + 's');
    console.log('   URL    :', result.url);
  } catch (err) {
    console.error('❌ Generation failed:', err.message);
    process.exit(1);
  }
}

main();
