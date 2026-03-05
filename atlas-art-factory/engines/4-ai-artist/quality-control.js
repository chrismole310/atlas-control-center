'use strict';

const fs = require('fs');
const Replicate = require('replicate');
const { createLogger } = require('../../core/logger');

const logger = createLogger('quality-control');

const QUALITY_THRESHOLD = 80; // minimum score to pass QC

/**
 * Score an artwork against its prompt using CLIP via Replicate.
 * @param {string} filePath - absolute path to the PNG file
 * @param {string} prompt - the generation prompt used
 * @returns {Promise<{score: number, passes: boolean, model: string}>}
 */
async function scoreArtwork(filePath, prompt) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Artwork file not found: ${filePath}`);
  }

  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

  // Read file as base64
  const imageData = fs.readFileSync(filePath);
  const base64Image = `data:image/png;base64,${imageData.toString('base64')}`;

  let output;
  try {
    output = await replicate.run(
      'openai/clip-vit-large-patch14',
      {
        input: {
          image: base64Image,
          candidates: prompt, // comma-separated candidate labels, or just the prompt
        },
      }
    );
  } catch (err) {
    throw new Error(`CLIP scoring failed for ${filePath}: ${err.message}`);
  }

  // output is typically an array of {label, score} or a number
  // Normalize to 0-100 scale
  let rawScore;
  if (Array.isArray(output)) {
    rawScore = output[0]?.score ?? 0; // first candidate's probability
  } else {
    rawScore = typeof output === 'number' ? output : 0;
  }

  const score = Math.round(rawScore * 100); // convert 0-1 probability to 0-100

  logger.info('Artwork scored', { filePath, prompt, score, passes: score >= QUALITY_THRESHOLD });

  return {
    score,
    passes: score >= QUALITY_THRESHOLD,
    model: 'clip-vit-large-patch14',
  };
}

/**
 * Run QC on a batch of artworks.
 * @param {Array<{id, file_path, prompt}>} artworks
 * @returns {Promise<Array<{id, file_path, prompt, score, passes}>>}
 */
async function batchScoreArtworks(artworks) {
  const results = await Promise.all(
    artworks.map(async (artwork) => {
      const { score, passes } = await scoreArtwork(artwork.file_path, artwork.prompt);
      return {
        ...artwork,
        score,
        passes,
      };
    })
  );
  return results;
}

module.exports = { scoreArtwork, batchScoreArtworks, QUALITY_THRESHOLD };
