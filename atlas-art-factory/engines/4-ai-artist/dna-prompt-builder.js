'use strict';

const { loadConfig } = require('../../core/config');
const { createLogger } = require('../../core/logger');

const logger = createLogger('dna-prompt-builder');

/**
 * Fill template variables in a prompt template.
 * {{animal}} → subject.animal, {{color1}} → subject.color1, etc.
 * Unfilled placeholders are left as-is.
 *
 * @param {string} template - Template string with {{variable}} placeholders
 * @param {object} subject  - Values to substitute
 * @returns {string} Filled template
 */
function fillTemplate(template, subject) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return subject[key] !== undefined ? subject[key] : match;
  });
}

/**
 * Get inspiration modifiers for an artist's DNA.
 * Looks up each sourceArtist in allInspirations, extracts
 * atlasApplication.promptModifiers, weights by influence %, and returns
 * the top modifier strings (up to 3 unique entries, highest influence first).
 *
 * @param {Array} inspirationDNA  - Array of { sourceArtist, influence } objects
 * @param {Array} allInspirations - Full inspirations config array
 * @returns {string[]} Array of prompt modifier strings
 */
function getInspirationModifiers(inspirationDNA, allInspirations) {
  if (!Array.isArray(inspirationDNA) || inspirationDNA.length === 0) return [];
  if (!Array.isArray(allInspirations)) allInspirations = [];

  // Sort DNA entries by influence descending so top influencers contribute first
  const sorted = [...inspirationDNA].sort((a, b) => (b.influence || 0) - (a.influence || 0));

  const collected = [];

  for (const dnaEntry of sorted) {
    const { sourceArtist, influence } = dnaEntry;
    if (!sourceArtist) continue;

    const inspiration = allInspirations.find(
      (insp) => insp.name && insp.name.toLowerCase() === sourceArtist.toLowerCase()
    );

    if (!inspiration) {
      logger.warn('Inspiration not found for sourceArtist', { sourceArtist });
      continue;
    }

    const modifiers =
      inspiration.atlasApplication && Array.isArray(inspiration.atlasApplication.promptModifiers)
        ? inspiration.atlasApplication.promptModifiers
        : [];

    // Weight: include more modifiers for higher-influence artists
    // 80-100% → 3 modifiers, 40-79% → 2 modifiers, <40% → 1 modifier
    const count = influence >= 80 ? 3 : influence >= 40 ? 2 : 1;
    const selected = modifiers.slice(0, count);
    collected.push(...selected);
  }

  // Deduplicate while preserving order, then cap at 3 total modifiers
  const seen = new Set();
  const unique = [];
  for (const mod of collected) {
    if (!seen.has(mod)) {
      seen.add(mod);
      unique.push(mod);
    }
  }

  return unique.slice(0, 3);
}

/**
 * Build an enriched prompt from an artist's DNA configuration.
 *
 * Steps:
 * 1. Start with the artist's enhancedPromptTemplate
 * 2. Replace {{variable}} placeholders with subject values
 * 3. Load inspirations and extract prompt modifiers weighted by DNA influence
 * 4. Append top modifiers to the filled template
 *
 * @param {object} artist  - Artist object from artists.json
 * @param {object} subject - Subject context (e.g. { animal: 'fox', color1: 'gold' })
 * @returns {string} Enhanced prompt string
 */
function buildPrompt(artist, subject = {}) {
  if (!artist) {
    logger.warn('buildPrompt called with no artist');
    return '';
  }

  const template = artist.enhancedPromptTemplate || '';
  const filled = fillTemplate(template, subject);

  const { inspirations: allInspirations } = loadConfig();
  const inspirationArr = Array.isArray(allInspirations) ? allInspirations : [];

  const dna = Array.isArray(artist.inspirationDNA) ? artist.inspirationDNA : [];
  const modifiers = getInspirationModifiers(dna, inspirationArr);

  const parts = [filled];
  if (modifiers.length > 0) {
    parts.push(modifiers.join(', '));
  }

  const prompt = parts.filter(Boolean).join(', ');
  logger.debug('Built prompt', { artistName: artist.name, promptLength: prompt.length });
  return prompt;
}

/**
 * Build a listing description using artist DNA and silo context.
 * Returns a 300+ word description incorporating the artwork's style, silo context,
 * artist's market positioning, cultural references, and SEO keywords.
 *
 * @param {object} artist  - Artist from artists.json
 * @param {object} silo    - Silo from silos.json
 * @param {object} artwork - Artwork metadata { title, style, colors }
 * @returns {string} Listing description (300+ characters)
 */
function buildListingDescription(artist, silo, artwork = {}) {
  if (!artist) {
    logger.warn('buildListingDescription called with no artist');
    return '';
  }

  const title       = (artwork && artwork.title)  || 'Untitled';
  const style       = (artwork && artwork.style)  || (artist.description || '');
  const colors      = (artwork && Array.isArray(artwork.colors) && artwork.colors.length > 0)
    ? artwork.colors
    : [];

  const siloName        = (silo && silo.name)        || '';
  const siloDescription = (silo && silo.description) || '';
  const siloKeywords    = (silo && Array.isArray(silo.keywords) && silo.keywords.length > 0)
    ? silo.keywords
    : [];

  const positioning     = artist.marketPositioning || {};
  const segment         = positioning.segment      || '';
  const pricePoint      = positioning.pricePoint   || '';
  const targetBuyers    = Array.isArray(positioning.targetBuyers) ? positioning.targetBuyers : [];

  const culturalRefs    = Array.isArray(artist.culturalReferences) ? artist.culturalReferences : [];

  const dna             = Array.isArray(artist.inspirationDNA) ? artist.inspirationDNA : [];
  const topInfluencer   = dna.length > 0
    ? dna.reduce((max, entry) => (entry.influence > max.influence ? entry : max), dna[0])
    : null;
  const topInfluencerName   = topInfluencer ? topInfluencer.sourceArtist : '';
  const topInfluencerTraits = topInfluencer && Array.isArray(topInfluencer.inheritedTraits)
    ? topInfluencer.inheritedTraits.join(', ')
    : '';

  const colorStr = colors.length > 0 ? colors.join(', ') : 'rich, carefully chosen hues';

  const targetBuyerStr  = targetBuyers.length > 0 ? targetBuyers.join(', ') : 'discerning collectors';
  const culturalRefStr  = culturalRefs.length > 0  ? culturalRefs.join('; ')  : '';
  const keywordsStr     = siloKeywords.length > 0  ? siloKeywords.join(', ')  : '';

  const lines = [];

  // Opening paragraph — introduce the piece
  lines.push(
    `Introducing "${title}" — a museum-quality fine art print that channels the bold spirit of ` +
    `${artist.name}. ${artist.description || ''}. ` +
    `Rendered in ${style} with a palette of ${colorStr}, this piece brings gallery-level ` +
    `sophistication directly into your home or office.`
  );

  // Artist DNA paragraph
  if (topInfluencerName) {
    lines.push(
      `The ${artist.name} aesthetic draws primarily from the legacy of ${topInfluencerName} — ` +
      `inheriting the iconic qualities of ${topInfluencerTraits}. ` +
      `These DNA-encoded influences have been remixed through a contemporary lens, producing ` +
      `a visual language that feels both timeless and urgently modern.`
    );
  }

  // Silo context paragraph
  if (siloDescription) {
    lines.push(
      `This artwork belongs to the "${siloName}" collection — ${siloDescription}. ` +
      `Whether you are furnishing a nursery, a living room, a boutique office, or a curated ` +
      `gallery wall, this print delivers the perfect balance of personality and polish.`
    );
  }

  // Cultural references paragraph
  if (culturalRefStr) {
    lines.push(
      `Culturally, this work resonates with a lineage of iconic moments: ${culturalRefStr}. ` +
      `If those reference points excite you, this print will feel like a natural extension ` +
      `of that conversation — at a fraction of the cost of original fine art.`
    );
  }

  // Market positioning paragraph
  {
    const segmentStr    = segment    ? ` in the ${segment.replace(/_/g, ' ')} market` : '';
    const pricePointStr = pricePoint ? ` at a ${pricePoint.replace(/_/g, ' ')} price point` : '';
    lines.push(
      `Positioned${segmentStr}${pricePointStr}, this print is designed for ${targetBuyerStr}. ` +
      `It ships as a high-resolution digital download, ready for professional printing at ` +
      `your preferred local printer or online service — in any size from 5×7 to 24×36.`
    );
  }

  // Quality and practical paragraph
  lines.push(
    `Each file is delivered at 300 DPI in sRGB color space, optimised for both fine-art ` +
    `inkjet printing and standard photo printing. Files are provided in JPEG and PDF formats. ` +
    `No physical product is shipped — you receive instant access to your high-resolution ` +
    `download immediately after purchase.`
  );

  // SEO keywords paragraph
  if (keywordsStr) {
    lines.push(
      `Perfect as a gift or as a statement piece for your own space. Search terms that ` +
      `describe this print: ${keywordsStr}. Add it to your cart today and transform ` +
      `any wall into a conversation-starting work of art.`
    );
  } else {
    lines.push(
      `Perfect as a gift or as a statement piece for your own space. Add it to your cart ` +
      `today and transform any wall into a conversation-starting work of art.`
    );
  }

  const description = lines.join('\n\n');
  logger.debug('Built listing description', { artistName: artist.name, charCount: description.length });
  return description;
}

module.exports = { buildPrompt, fillTemplate, getInspirationModifiers, buildListingDescription };
