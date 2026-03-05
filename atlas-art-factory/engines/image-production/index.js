'use strict';

const { v4: uuidv4 } = require('uuid');
const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');
const { buildPrompt } = require('../4-ai-artist/dna-prompt-builder');
const { selectEngine, getAdapter } = require('./ai-router');
const { scoreImage } = require('./quality-controller');

const logger = createLogger('image-production');

async function generateArtwork({ artist, silo, subject, quality }) {
  const uuid = uuidv4();
  const prompt = buildPrompt(artist, subject || {});
  const engineName = selectEngine({
    tags: silo?.name ? [silo.name] : [],
    quality,
    preferredEngine: artist.preferred_ai_engine,
  });
  const adapter = getAdapter(engineName);

  // Insert artwork record
  const { rows } = await query(
    `INSERT INTO artworks (uuid, artist_id, silo_id, title, prompt, negative_prompt, ai_engine, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'generating')
     RETURNING id`,
    [uuid, artist.id, silo?.id, `${silo?.name || 'art'}-${uuid.slice(0, 8)}`, prompt,
     (artist.negative_prompts || []).join(', '), engineName]
  );
  const artworkId = rows[0].id;

  // Generate image
  const genResult = await adapter.generate({
    prompt,
    model: engineName === 'dalle3' ? undefined : `black-forest-labs/FLUX.1-${engineName === 'flux-dev' ? 'dev' : 'schnell'}`,
    negativePrompt: (artist.negative_prompts || []).join(', '),
  });

  // Score quality
  const qcResult = await scoreImage(genResult.image_url);

  // Update artwork with results
  await query(
    `UPDATE artworks SET
       master_image_url = $1, quality_score = $2, status = $3,
       ai_params = $4, generation_time = $5, updated_at = NOW()
     WHERE id = $6`,
    [genResult.image_url, qcResult.total_score,
     qcResult.total_score >= 80 ? 'approved' : 'rejected',
     JSON.stringify(genResult), 0, artworkId]
  );

  return { artwork_id: artworkId, uuid, image_url: genResult.image_url, quality_score: qcResult.total_score, engine: engineName };
}

async function runImageProduction() {
  logger.info('Starting image production run');

  // Get active silos with their assigned artists and daily allocation
  const { rows: assignments } = await query(
    `SELECT s.id AS silo_id, s.name AS silo_name, a.id AS artist_id, a.name AS artist_name,
            s.target_daily_output AS allocation, a.enhancedPromptTemplate,
            a.negative_prompts, a.preferred_ai_engine, a.style_rules, a.prompt_templates
     FROM silos s
     JOIN ai_artists a ON a.silo_id = s.id
     WHERE s.status = 'active' AND a.status = 'active'
     ORDER BY s.priority DESC`
  );

  let totalGenerated = 0;
  let totalPassedQC = 0;

  for (const assignment of assignments) {
    const count = assignment.allocation || 4;
    for (let i = 0; i < count; i++) {
      try {
        const result = await generateArtwork({
          artist: {
            id: assignment.artist_id,
            name: assignment.artist_name,
            enhancedPromptTemplate: assignment.enhancedprompttemplate || assignment.enhancedPromptTemplate,
            negative_prompts: assignment.negative_prompts || [],
            preferred_ai_engine: assignment.preferred_ai_engine,
          },
          silo: { id: assignment.silo_id, name: assignment.silo_name },
        });
        totalGenerated++;
        if (result.quality_score >= 80) totalPassedQC++;
      } catch (err) {
        logger.error(`Generation failed for ${assignment.silo_name}`, { error: err.message });
      }
    }
  }

  const summary = { total_generated: totalGenerated, total_passed_qc: totalPassedQC };
  logger.info('Image production complete', summary);
  return summary;
}

module.exports = { generateArtwork, runImageProduction };
