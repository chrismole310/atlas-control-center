'use strict';

const { createLogger } = require('../../core/logger');

const logger = createLogger('prompt-builder');

// Load artist-inspirations at module level (static JSON, safe to require directly)
const inspirations = require('../../config/artist-inspirations.json');

/**
 * Fallback colors used when an artist has no inspirationDNA or no matching
 * inspiration entry with colorSignatures.
 */
const FALLBACK_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];

/**
 * Select a color palette for an artist from their inspirationDNA color signatures.
 * Finds the primary inspiration (highest influence %), loads that artist's
 * colorSignatures.primary from artist-inspirations.json, and returns the first
 * 4 colors.
 *
 * @param {Object} artist - artist config object
 * @returns {string[]} array of up to 4 color strings
 */
function selectColors(artist) {
  if (!artist) return FALLBACK_COLORS;

  const dna = Array.isArray(artist.inspirationDNA) ? artist.inspirationDNA : [];
  if (dna.length === 0) return FALLBACK_COLORS;

  // Find the primary inspiration — highest influence %
  const primary = dna.reduce((best, entry) => {
    return (entry.influence || 0) > (best.influence || 0) ? entry : best;
  }, dna[0]);

  if (!primary || !primary.sourceArtist) return FALLBACK_COLORS;

  const inspEntry = inspirations.find(
    (i) => i.name && i.name.toLowerCase() === primary.sourceArtist.toLowerCase()
  );

  if (!inspEntry) {
    logger.warn('selectColors: inspiration not found', { sourceArtist: primary.sourceArtist });
    return FALLBACK_COLORS;
  }

  const colorPrimary =
    inspEntry.colorSignatures && Array.isArray(inspEntry.colorSignatures.primary)
      ? inspEntry.colorSignatures.primary
      : null;

  if (!colorPrimary || colorPrimary.length === 0) return FALLBACK_COLORS;

  return colorPrimary.slice(0, 4);
}

/**
 * Inject keywords into a prompt template.
 * Template variables: {{animal}}, {{color1}}, {{color2}}, {{color3}},
 * {{color4}}, {{accent_color}}.
 * Also appends the top 3 trending keywords as natural language additions.
 *
 * @param {string} template
 * @param {Object} vars - { subject, colors, trendingKeywords }
 * @param {string} [vars.subject='animal'] - replaces {{animal}}
 * @param {string[]} [vars.colors=[]] - replaces {{color1}} … {{color4}} and {{accent_color}}
 * @param {string[]} [vars.trendingKeywords=[]] - top keywords appended naturally
 * @returns {string}
 */
function injectKeywords(template, vars) {
  if (typeof template !== 'string') return '';

  const subject = vars.subject || 'animal';
  const colors = Array.isArray(vars.colors) ? vars.colors : [];
  const trendingKeywords = Array.isArray(vars.trendingKeywords) ? vars.trendingKeywords : [];

  // Build color substitution map
  const colorMap = {
    color1: colors[0] || FALLBACK_COLORS[0],
    color2: colors[1] || FALLBACK_COLORS[1],
    color3: colors[2] || FALLBACK_COLORS[2],
    color4: colors[3] || FALLBACK_COLORS[3],
    accent_color: colors[0] || FALLBACK_COLORS[0],
  };

  // Replace all template placeholders
  let filled = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key === 'animal') return subject;
    if (colorMap[key] !== undefined) return colorMap[key];
    return match;
  });

  // Append top 3 trending keywords as natural language additions
  const topTrending = trendingKeywords.slice(0, 3);
  if (topTrending.length > 0) {
    const trendingParts = topTrending.map(
      (kw) => `${kw} inspired, ${kw} aesthetic, trending ${kw}`
    );
    filled = filled + ', ' + trendingParts.join(', ');
  }

  return filled;
}

/**
 * Determine if a prompt likely contains typography (for router decisions).
 *
 * @param {string} prompt
 * @returns {boolean}
 */
function hasTypography(prompt) {
  if (typeof prompt !== 'string') return false;
  const typographyWords = ['quote', 'text', 'typography', 'lettering', 'font', 'words', 'saying', 'phrase'];
  const lower = prompt.toLowerCase();
  return typographyWords.some((word) => lower.includes(word));
}

/**
 * Determine if a job should be flagged as premium (for router decisions).
 * Returns true if artist's preferred_engine is 'midjourney' or 'dalle3'.
 *
 * @param {Object} artist
 * @returns {boolean}
 */
function isPremium(artist) {
  if (!artist) return false;
  const engine = artist.preferred_engine || '';
  return engine === 'midjourney' || engine === 'dalle3';
}

/**
 * Build a complete generation prompt for an artwork job.
 *
 * Steps:
 * 1. Start with artist.enhancedPromptTemplate
 * 2. Call injectKeywords to fill template vars and append trending keywords
 * 3. Append silo name naturally
 * 4. Append artist.negative_prompts joined as "avoid: X, Y, Z"
 *
 * @param {Object} artist - artist config object from artists.json
 * @param {Object} silo - silo object { id, name, keywords: string[] }
 * @param {Object} [options={}]
 * @param {string[]} [options.trendingKeywords=[]] - top keywords from demand_scores
 * @param {string} [options.subject='animal'] - subject to inject into template
 * @param {string[]} [options.colors=[]] - color hex array or names; if empty, selectColors is used
 * @returns {string} final prompt ready for AI generation
 */
function buildArtworkPrompt(artist, silo, options = {}) {
  if (!artist) {
    logger.warn('buildArtworkPrompt called with no artist');
    return '';
  }

  const trendingKeywords = Array.isArray(options.trendingKeywords) ? options.trendingKeywords : [];
  const subject = options.subject || 'animal';

  // Use provided colors or select from artist DNA
  const colors =
    Array.isArray(options.colors) && options.colors.length > 0
      ? options.colors
      : selectColors(artist);

  const template = artist.enhancedPromptTemplate || '';

  // Fill template with vars + trending keywords
  let prompt = injectKeywords(template, { subject, colors, trendingKeywords });

  // Append silo name naturally
  const siloName = (silo && silo.name) || '';
  if (siloName) {
    prompt = prompt + ', ' + siloName + ' style';
  }

  // Append negative prompts as "avoid: X, Y, Z" for engines that support them inline
  const negativePrompts = Array.isArray(artist.negative_prompts) ? artist.negative_prompts : [];
  if (negativePrompts.length > 0) {
    prompt = prompt + ', avoid: ' + negativePrompts.join(', ');
  }

  logger.debug('Built artwork prompt', {
    artistName: artist.name,
    siloName,
    promptLength: prompt.length,
  });

  return prompt;
}

module.exports = { buildArtworkPrompt, injectKeywords, selectColors, hasTypography, isPremium };
