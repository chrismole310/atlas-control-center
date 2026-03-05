'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { query, closePool } = require('../core/database');
const { loadConfig } = require('../core/config');
const { createLogger } = require('../core/logger');

const logger = createLogger('seed');

/**
 * Seed silos from config into the silos table.
 * Returns a map of { name -> id } for FK resolution.
 */
async function seedSilos(silos) {
  logger.info(`Seeding ${silos.length} silos...`);
  const siloMap = {};

  for (const silo of silos) {
    const result = await query(
      `INSERT INTO silos (name, category, description, target_daily_output, priority)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO UPDATE
         SET category            = EXCLUDED.category,
             description         = EXCLUDED.description,
             target_daily_output = EXCLUDED.target_daily_output,
             priority            = EXCLUDED.priority,
             updated_at          = NOW()
       RETURNING id`,
      [
        silo.name,
        silo.category || null,
        silo.description || null,
        silo.target_daily_output || 4,
        silo.priority || 50,
      ]
    );

    const siloId = result.rows[0].id;
    siloMap[silo.name] = siloId;

    // Insert keywords into silo_keywords (ignore duplicates)
    if (Array.isArray(silo.keywords)) {
      for (const keyword of silo.keywords) {
        await query(
          `INSERT INTO silo_keywords (silo_id, keyword)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [siloId, keyword]
        );
      }
    }
  }

  logger.info(`Seeded ${silos.length} silos`);
  return siloMap;
}

/**
 * Seed artists from config into the ai_artists table.
 * siloMap: { siloName -> silo_id } for FK resolution.
 */
async function seedArtists(artists, siloMap) {
  logger.info(`Seeding ${artists.length} artists...`);
  let count = 0;

  for (const artist of artists) {
    const siloId = siloMap[artist.silo] || null;

    // Build JSONB fields from artists.json structure
    const styleRules = {
      enhancedPromptTemplate: artist.enhancedPromptTemplate || '',
      styleCluster: artist.styleCluster || '',
    };
    const promptTemplates = {
      enhanced: artist.enhancedPromptTemplate || '',
    };
    const technicalParams = {
      marketPositioning: artist.marketPositioning || {},
      culturalReferences: artist.culturalReferences || [],
    };
    // inspirationDNA is an array of objects — store in color_palettes repurposed field
    // but more correctly: store in a dedicated JSONB. We'll use composition_rules for DNA.
    const compositionRules = {
      inspirationDNA: artist.inspirationDNA || [],
    };

    await query(
      `INSERT INTO ai_artists
         (name, persona, silo_id, preferred_ai_engine,
          style_rules, color_palettes, composition_rules, prompt_templates,
          negative_prompts, technical_params, daily_quota)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (name) DO UPDATE
         SET persona            = EXCLUDED.persona,
             silo_id            = EXCLUDED.silo_id,
             preferred_ai_engine = EXCLUDED.preferred_ai_engine,
             style_rules        = EXCLUDED.style_rules,
             color_palettes     = EXCLUDED.color_palettes,
             composition_rules  = EXCLUDED.composition_rules,
             prompt_templates   = EXCLUDED.prompt_templates,
             negative_prompts   = EXCLUDED.negative_prompts,
             technical_params   = EXCLUDED.technical_params,
             daily_quota        = EXCLUDED.daily_quota,
             updated_at         = NOW()`,
      [
        artist.name,
        artist.description || null,                   // persona ← description
        siloId,
        artist.preferred_engine || null,
        styleRules,                                    // jsonb — pg driver handles objects
        {},                                            // color_palettes (not in JSON; empty obj)
        compositionRules,                              // jsonb — inspirationDNA stored here
        promptTemplates,                               // jsonb
        artist.negative_prompts || [],                 // text[] — pg driver handles arrays
        technicalParams,                               // jsonb
        4,                                             // daily_quota default
      ]
    );

    count++;
  }

  logger.info(`Seeded ${count} artists`);
}

async function main() {
  try {
    const config = loadConfig();

    // config.silos and config.artists are plain arrays from JSON
    const silos   = Array.isArray(config.silos)   ? config.silos   : (config.silos.silos     || []);
    const artists = Array.isArray(config.artists) ? config.artists : (config.artists.artists || []);

    // Seed silos first (artists have FK dependency on silos)
    const siloMap = await seedSilos(silos);

    // Seed artists using silo name→id map
    await seedArtists(artists, siloMap);

    logger.info('Seed complete');
  } catch (err) {
    logger.error('Seed failed', { error: err.message });
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
