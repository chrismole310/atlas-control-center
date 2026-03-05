'use strict';

/**
 * One-time script: generate 5 photorealistic room backgrounds using FLUX.1 dev on Replicate.
 * Each room has a blank white portrait frame on the wall as an art placeholder.
 * Saves to storage/room-backgrounds/ with a metadata JSON for art zone coordinates.
 */

require('dotenv').config();
const Replicate = require('replicate');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const OUTPUT_DIR = path.join(__dirname, 'storage/room-backgrounds');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const ROOMS = [
  {
    id: 'living-room',
    label: 'Living Room',
    prompt: 'Photorealistic modern living room interior, bright natural light from large windows, clean white wall on the left side, a large empty white rectangular picture frame with thin gold border mounted centered on the white wall, Scandinavian minimal style, light wood floors, neutral beige sofa, soft shadows, professional interior photography, 4K quality. The white frame takes up about 25% of the image height and is clearly visible on the wall.',
    // art zone will be measured after generation — placeholder coords
    artZone: { xPct: 0.38, yPct: 0.15, wPct: 0.26, hPct: 0.45 },
  },
  {
    id: 'bedroom',
    label: 'Bedroom',
    prompt: 'Photorealistic cozy modern bedroom interior, soft morning light, clean white wall above the bed headboard, a large empty white rectangular picture frame with thin black border mounted centered above the bed, minimalist Scandinavian style, white linen bedding, bedside tables with small lamps, warm tones, professional interior photography, 4K quality. The white frame is clearly centered above the headboard.',
    artZone: { xPct: 0.35, yPct: 0.08, wPct: 0.28, hPct: 0.42 },
  },
  {
    id: 'office',
    label: 'Home Office',
    prompt: 'Photorealistic modern home office interior, bright natural light, clean white wall behind a minimal wood desk, a large empty white rectangular picture frame with thin dark border mounted centered on the white wall, contemporary style, wood desk with laptop, clean minimal decor, professional interior photography, 4K quality. The white frame is prominently visible on the wall behind the desk.',
    artZone: { xPct: 0.36, yPct: 0.10, wPct: 0.27, hPct: 0.44 },
  },
  {
    id: 'nursery',
    label: 'Nursery',
    prompt: 'Photorealistic modern nursery room interior, soft pastel light, clean white wall, a large empty white rectangular picture frame with thin pastel pink border mounted centered on the white wall, soft and minimal Scandinavian nursery style, white crib, soft rug, gentle warm lighting, professional interior photography, 4K quality. The white frame is clearly visible centered on the wall.',
    artZone: { xPct: 0.37, yPct: 0.12, wPct: 0.27, hPct: 0.43 },
  },
  {
    id: 'bathroom',
    label: 'Bathroom',
    prompt: 'Photorealistic modern spa-style bathroom interior, soft natural light, clean white tile wall, a large empty white rectangular picture frame with thin brushed gold border mounted on the wall beside the vanity mirror, luxury minimal style, white marble surfaces, clean towels, professional interior photography, 4K quality. The white frame is clearly visible on the wall.',
    artZone: { xPct: 0.55, yPct: 0.15, wPct: 0.22, hPct: 0.40 },
  },
];

async function downloadImage(url, dest) {
  const urlStr = url instanceof URL ? url.href : String(url);
  const protocol = urlStr.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    protocol.get(urlStr, res => {
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function main() {
  console.log('🏠 Generating 5 photorealistic room backgrounds via FLUX.1 dev (Replicate)');
  console.log('   Cost: ~$0.08 total (5 × ~$0.015)');
  console.log('');

  const metadata = [];

  for (const room of ROOMS) {
    const filePath = path.join(OUTPUT_DIR, `${room.id}.png`);
    if (fs.existsSync(filePath)) {
      console.log(`⏭  ${room.label} already exists — skipping`);
      metadata.push({
        id: room.id, label: room.label, file: `${room.id}.png`,
        canvasWidth: 1360, canvasHeight: 768,
        artZone: {
          x: Math.round(room.artZone.xPct * 1360), y: Math.round(room.artZone.yPct * 768),
          width: Math.round(room.artZone.wPct * 1360), height: Math.round(room.artZone.hPct * 768),
        },
      });
      continue;
    }
    console.log(`⏳ Generating ${room.label}...`);
    const start = Date.now();

    const output = await replicate.run('black-forest-labs/flux-dev', {
      input: {
        prompt: room.prompt,
        aspect_ratio: '16:9',
        num_outputs: 1,
        output_format: 'png',
        output_quality: 100,
        guidance: 3.5,
      },
    });

    const rawUrl = Array.isArray(output) ? output[0] : output;
    await downloadImage(rawUrl, filePath);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✅ ${room.label} saved → ${room.id}.png (${elapsed}s)`);

    // Skip delay after the last room
    if (room !== ROOMS[ROOMS.length - 1]) {
      console.log('   ⏸  Waiting 12s (free tier rate limit)...');
      await new Promise(r => setTimeout(r, 12000));
    }

    metadata.push({
      id: room.id,
      label: room.label,
      file: `${room.id}.png`,
      canvasWidth: 1360,
      canvasHeight: 768,
      // Art zone as pixel coordinates (derived from percentages)
      artZone: {
        x: Math.round(room.artZone.xPct * 1360),
        y: Math.round(room.artZone.yPct * 768),
        width: Math.round(room.artZone.wPct * 1360),
        height: Math.round(room.artZone.hPct * 768),
      },
    });
  }

  // Save metadata so room-templates.js knows where to composite
  const metaPath = path.join(OUTPUT_DIR, 'templates.json');
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

  console.log('');
  console.log('✅ All 5 rooms generated!');
  console.log('   Metadata saved → storage/room-backgrounds/templates.json');
  console.log('');
  console.log('Opening rooms...');

  const { execSync } = require('child_process');
  metadata.forEach(m => {
    try { execSync(`open "${path.join(OUTPUT_DIR, m.file)}"`); } catch(e) {}
  });
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
