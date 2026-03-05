'use strict';

const { v4: uuidv4 } = require('uuid');
const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');
const { buildArtworkPrompt } = require('./prompt-builder');
const { routeAndGenerate } = require('./router');
const { scoreArtwork } = require('./quality-control');
const { generateVariations } = require('./variation-generator');

const logger = createLogger('ai-artist');

/**
 * Run a single artwork generation job end-to-end:
 * 1. Build prompt (prompt-builder.js)
 * 2. Route + generate image (router.js)
 * 3. Score quality (quality-control.js)
 * 4. If passes QC: save to artworks DB table, generate 3 variations
 * 5. If fails QC: log rejection, return null
 * 6. Return { artwork, variations, qcResult }
 *
 * @param {Object} job - { artist, silo, options }
 * @returns {Promise<{artwork, variations, qcResult}|null>}
 */
async function generateArtwork(job) {
  const { artist, silo, options = {} } = job;

  // Step 1: Build the prompt
  const prompt = buildArtworkPrompt(artist, silo, options);

  logger.info('Starting artwork generation', {
    artistName: artist && artist.name,
    siloName: silo && silo.name,
    promptLength: prompt.length,
  });

  // Step 2: Route + generate image
  const generationJob = {
    prompt,
    artist,
    silo,
    flags: {
      isBatch: true,
      ...(options.flags || {}),
    },
    options: {
      outputId: uuidv4(),
      ...(options.generationOptions || {}),
    },
  };

  let generationResult;
  try {
    generationResult = await routeAndGenerate(generationJob);
  } catch (err) {
    logger.error('Image generation failed', { error: err.message });
    throw err;
  }

  const filePath = generationResult.file_path;

  // Step 3: Score quality
  let qcResult;
  try {
    qcResult = await scoreArtwork(filePath, prompt);
  } catch (err) {
    logger.error('QC scoring failed', { error: err.message, filePath });
    throw err;
  }

  // Step 4/5: QC decision
  if (!qcResult.passes) {
    logger.info('Artwork rejected by QC', {
      filePath,
      score: qcResult.score,
      threshold: 80,
    });
    return null;
  }

  // Step 4: Save to artworks DB table
  const artworkUuid = uuidv4();
  const title = options.title || `${(artist && artist.name) || 'Artist'} — ${(silo && silo.name) || 'Silo'}`;

  let savedArtwork;
  try {
    const result = await query(
      `INSERT INTO artworks
         (uuid, artist_id, silo_id, title, prompt, ai_engine, master_image_path, quality_score, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        artworkUuid,
        (artist && artist.id) || null,
        (silo && silo.id) || null,
        title,
        prompt,
        generationResult.engine || null,
        filePath,
        qcResult.score,
        'generated',
      ]
    );
    savedArtwork = result.rows[0];
  } catch (err) {
    logger.error('Failed to save artwork to DB', { error: err.message });
    throw err;
  }

  logger.info('Artwork saved to DB', {
    artworkId: savedArtwork.id,
    uuid: artworkUuid,
    score: qcResult.score,
  });

  // Step 4 continued: Generate 3 variations
  let variations = [];
  try {
    variations = await generateVariations(
      {
        id: savedArtwork.id,
        prompt,
        artist,
        file_path: filePath,
      },
      { routeAndGenerate }
    );
  } catch (err) {
    logger.warn('Variation generation failed — continuing without variations', { error: err.message });
  }

  return {
    artwork: savedArtwork,
    variations,
    qcResult,
  };
}

/**
 * Run the daily batch of artwork generation jobs.
 *
 * @param {Object} options - { dailyTarget=200, silos, artists }
 * @returns {Promise<{generated, rejected, errors, elapsed}>}
 */
async function runDailyBatch(options = {}) {
  const { dailyTarget = 200 } = options;
  const startTime = Date.now();

  logger.info('Starting daily batch', { dailyTarget });

  // Get active silos from DB (or use provided)
  let silos = options.silos;
  if (!silos) {
    const silosResult = await query(
      "SELECT id, name, category, priority FROM silos WHERE status = 'active' ORDER BY priority DESC"
    );
    silos = silosResult.rows;
  }

  // Get active artists from DB (or use provided)
  let artists = options.artists;
  if (!artists) {
    const artistsResult = await query(
      "SELECT id, name, silo_id, preferred_ai_engine, daily_quota FROM ai_artists WHERE status = 'active'"
    );
    artists = artistsResult.rows;
  }

  if (silos.length === 0) {
    logger.warn('No active silos found — batch aborted');
    return { generated: 0, rejected: 0, errors: 0, elapsed: Date.now() - startTime };
  }

  if (artists.length === 0) {
    logger.warn('No active artists found — batch aborted');
    return { generated: 0, rejected: 0, errors: 0, elapsed: Date.now() - startTime };
  }

  let generated = 0;
  let rejected = 0;
  let errors = 0;
  let slot = 0;

  // Run artworks sequentially to avoid API rate limits
  while (slot < dailyTarget) {
    const silo = silos[slot % silos.length];
    const artist = artists[slot % artists.length];

    const job = {
      artist,
      silo,
      options: {},
    };

    try {
      const result = await generateArtwork(job);
      if (result === null) {
        rejected++;
        logger.info('Artwork rejected', { slot: slot + 1, siloName: silo.name, artistName: artist.name });
      } else {
        generated++;
        logger.info('Artwork generated', {
          slot: slot + 1,
          artworkId: result.artwork && result.artwork.id,
          siloName: silo.name,
          artistName: artist.name,
          score: result.qcResult && result.qcResult.score,
        });
      }
    } catch (err) {
      errors++;
      logger.error('Artwork generation error', {
        slot: slot + 1,
        error: err.message,
        siloName: silo.name,
        artistName: artist.name,
      });
    }

    slot++;
  }

  const elapsed = Date.now() - startTime;

  logger.info('Daily batch complete', { dailyTarget, generated, rejected, errors, elapsed });

  return { generated, rejected, errors, elapsed };
}

module.exports = { generateArtwork, runDailyBatch };
