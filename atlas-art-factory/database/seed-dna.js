'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { query, closePool } = require('../core/database');
const { loadConfig } = require('../core/config');
const { createLogger } = require('../core/logger');

const logger = createLogger('seed-dna');

/**
 * Seed artist_inspirations from config.
 * Returns a map of { name -> id } for use when linking DNA.
 *
 * DB columns:
 *   name, category, era, style_characteristics (JSONB), color_signatures (JSONB),
 *   composition_patterns (JSONB), famous_works (TEXT[]), market_value_tier,
 *   cultural_influence, atlas_application (JSONB)
 *
 * JSON fields (from artist-inspirations.json):
 *   name, category, era, styleCharacteristics, colorSignatures,
 *   compositionPatterns, marketValueTier, culturalInfluence, atlasApplication
 */
async function seedInspirations(inspirations) {
  logger.info(`Seeding ${inspirations.length} artist inspirations...`);
  const idMap = {}; // name -> id

  for (const insp of inspirations) {
    const result = await query(
      `INSERT INTO artist_inspirations
         (name, category, era, style_characteristics, color_signatures,
          composition_patterns, famous_works, market_value_tier, cultural_influence, atlas_application)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (name) DO UPDATE SET
         category            = EXCLUDED.category,
         era                 = EXCLUDED.era,
         style_characteristics = EXCLUDED.style_characteristics,
         color_signatures    = EXCLUDED.color_signatures,
         composition_patterns = EXCLUDED.composition_patterns,
         famous_works        = EXCLUDED.famous_works,
         market_value_tier   = EXCLUDED.market_value_tier,
         cultural_influence  = EXCLUDED.cultural_influence,
         atlas_application   = EXCLUDED.atlas_application
       RETURNING id`,
      [
        insp.name,
        insp.category || null,
        insp.era || null,
        JSON.stringify(insp.styleCharacteristics || {}),
        JSON.stringify(insp.colorSignatures || {}),
        JSON.stringify(insp.compositionPatterns || {}),
        insp.famousWorks || [],
        insp.marketValueTier || null,
        insp.culturalInfluence || null,
        JSON.stringify(insp.atlasApplication || {}),
      ]
    );
    idMap[insp.name] = result.rows[0].id;
  }

  logger.info(`Seeded ${Object.keys(idMap).length} inspirations`);
  return idMap;
}

/**
 * Seed style_clusters from config.
 * Returns a map of { cluster_name -> id }.
 *
 * DB columns (unique on cluster_name):
 *   cluster_name, description, inspiration_ids (INTEGER[]), market_segment,
 *   target_platforms (TEXT[]), avg_price_point, cultural_markers (JSONB),
 *   key_characteristics (JSONB)
 *
 * JSON fields (from style-clusters.json):
 *   name, description, inspirationArtists, marketSegment, targetPlatforms,
 *   avgPricePoint, culturalMarkers, keyCharacteristics
 */
async function seedStyleClusters(clusters, inspirationIdMap) {
  logger.info(`Seeding ${clusters.length} style clusters...`);
  const idMap = {}; // cluster_name -> id

  for (const cluster of clusters) {
    // Resolve inspiration IDs from the inspirationArtists names array
    const inspirationIds = (cluster.inspirationArtists || [])
      .map(artistName => {
        const inspId = inspirationIdMap[artistName];
        if (!inspId) {
          logger.warn(`Style cluster '${cluster.name}' references unknown inspiration: '${artistName}'`);
        }
        return inspId;
      })
      .filter(Boolean);

    const result = await query(
      `INSERT INTO style_clusters
         (cluster_name, description, inspiration_ids, market_segment,
          target_platforms, avg_price_point, cultural_markers, key_characteristics)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (cluster_name) DO UPDATE SET
         description        = EXCLUDED.description,
         inspiration_ids    = EXCLUDED.inspiration_ids,
         market_segment     = EXCLUDED.market_segment,
         target_platforms   = EXCLUDED.target_platforms,
         avg_price_point    = EXCLUDED.avg_price_point,
         cultural_markers   = EXCLUDED.cultural_markers,
         key_characteristics = EXCLUDED.key_characteristics
       RETURNING id`,
      [
        cluster.name,
        cluster.description || null,
        inspirationIds,
        cluster.marketSegment || null,
        cluster.targetPlatforms || [],
        cluster.avgPricePoint || null,
        JSON.stringify(cluster.culturalMarkers || []),
        JSON.stringify(cluster.keyCharacteristics || {}),
      ]
    );
    idMap[cluster.name] = result.rows[0].id;
  }

  logger.info(`Seeded ${Object.keys(idMap).length} style clusters`);
  return idMap;
}

/**
 * Seed ai_artist_dna links for each artist in artists.json.
 *
 * DB columns for ai_artist_dna:
 *   ai_artist_id, inspiration_source_id, influence_percentage,
 *   inherited_characteristics (JSONB), style_fusion_notes
 *
 * JSON fields per DNA entry:
 *   sourceArtist (maps to inspiration name), influence (maps to influence_percentage),
 *   inheritedTraits (array -> stored as JSONB in inherited_characteristics)
 */
async function seedArtistDNA(artists, inspirationIdMap, clusterIdMap) {
  logger.info(`Seeding DNA links for ${artists.length} artists...`);
  let count = 0;

  for (const artist of artists) {
    if (!artist.inspirationDNA || !artist.inspirationDNA.length) continue;

    // Look up the ai_artists row by name
    const artistRow = await query(
      'SELECT id FROM ai_artists WHERE name = $1',
      [artist.name]
    );
    if (!artistRow.rows.length) {
      logger.warn(`Artist not found in DB, skipping: ${artist.name}`);
      continue;
    }
    const artistId = artistRow.rows[0].id;

    // Style cluster note for style_fusion_notes (informational)
    const clusterName = artist.styleCluster || null;

    for (const dna of artist.inspirationDNA) {
      const inspirationId = inspirationIdMap[dna.sourceArtist];
      if (!inspirationId) {
        logger.warn(`Inspiration not found for sourceArtist: ${dna.sourceArtist}`);
        continue;
      }

      const inheritedCharacteristics = dna.inheritedTraits
        ? JSON.stringify(dna.inheritedTraits)
        : JSON.stringify([]);

      await query(
        `INSERT INTO ai_artist_dna
           (ai_artist_id, inspiration_source_id, influence_percentage,
            inherited_characteristics, style_fusion_notes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (ai_artist_id, inspiration_source_id) DO UPDATE SET
           influence_percentage     = EXCLUDED.influence_percentage,
           inherited_characteristics = EXCLUDED.inherited_characteristics,
           style_fusion_notes       = EXCLUDED.style_fusion_notes`,
        [
          artistId,
          inspirationId,
          dna.influence || 0,
          inheritedCharacteristics,
          clusterName,
        ]
      );
      count++;
    }
  }

  logger.info(`Seeded ${count} DNA links`);
  return count;
}

async function main() {
  try {
    const config = loadConfig();
    const inspirations = Array.isArray(config.inspirations) ? config.inspirations : [];
    const clusters = Array.isArray(config.styleClusters) ? config.styleClusters : [];
    const artists = Array.isArray(config.artists) ? config.artists : [];

    logger.info('Starting DNA seed', {
      inspirations: inspirations.length,
      clusters: clusters.length,
      artists: artists.length,
    });

    const inspirationIdMap = await seedInspirations(inspirations);
    const clusterIdMap = await seedStyleClusters(clusters, inspirationIdMap);
    await seedArtistDNA(artists, inspirationIdMap, clusterIdMap);

    logger.info('DNA seed complete');
  } catch (err) {
    logger.error('DNA seed failed', { error: err.message });
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
