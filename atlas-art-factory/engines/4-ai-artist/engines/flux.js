'use strict';

const path = require('path');
const fs = require('fs');
const https = require('https');

const STORAGE_DIR = path.join(__dirname, '../../../storage/artworks');

// Cloudflare Workers AI — FLUX.1-schnell (free, 10k req/day)
const CF_MODEL = '@cf/black-forest-labs/flux-1-schnell';

// Portrait 2:3 ratio at ~1MP — standard for print art
const DEFAULT_WIDTH  = 768;
const DEFAULT_HEIGHT = 1024;

/**
 * Generate image via Cloudflare Workers AI.
 * Returns a Buffer of the PNG image.
 */
async function _cfGenerate(prompt, width, height) {
  const token     = process.env.CLOUDFLARE_AI_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) throw new Error('CLOUDFLARE_AI_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set');

  const body = JSON.stringify({ prompt, width, height, num_steps: 4 });

  return new Promise((resolve, reject) => {
    const chunks = [];
    const req = https.request(
      {
        hostname: 'api.cloudflare.com',
        path: `/client/v4/accounts/${accountId}/ai/run/${CF_MODEL}`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let data;
          try { data = JSON.parse(text); } catch {
            return reject(new Error(`CF non-JSON response: ${text.slice(0, 200)}`));
          }
          if (!data.success) {
            const msg = data.errors?.[0]?.message || JSON.stringify(data.errors);
            return reject(new Error(`Cloudflare Workers AI error: ${msg}`));
          }
          const b64 = data.result?.image;
          if (!b64) return reject(new Error('No image in Cloudflare response'));
          resolve(Buffer.from(b64, 'base64'));
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Internal helper: generate and save to disk.
 */
async function _generate(prompt, options = {}) {
  const width  = options.width  || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;

  let imageBuffer;
  try {
    imageBuffer = await _cfGenerate(prompt, width, height);
  } catch (err) {
    throw new Error(`FLUX generation failed: ${err.message}`);
  }

  const id = options.outputId || `flux_${Date.now()}`;
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  const file_path = path.join(STORAGE_DIR, `${id}.png`);
  fs.writeFileSync(file_path, imageBuffer);

  return { id, file_path, engine: 'cf-flux-schnell', width, height, prompt };
}

async function generateFluxSchnell(prompt, options = {}) {
  return _generate(prompt, options);
}

async function generateFluxDev(prompt, options = {}) {
  // CF only has schnell — dev-quality is achieved via more descriptive prompts
  return _generate(prompt, options);
}

module.exports = { generateFluxSchnell, generateFluxDev };
