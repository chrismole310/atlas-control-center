'use strict';

const {
  buildArtworkPrompt,
  injectKeywords,
  selectColors,
  hasTypography,
  isPremium,
} = require('../../engines/4-ai-artist/prompt-builder');

const artists = require('../../config/artists.json');
const inspirations = require('../../config/artist-inspirations.json');

// artist id=1 is "Neon Basquiat Beast"
const artist1 = artists.find((a) => a.id === 1);
// A silo-like object for testing
const testSilo = { id: 1, name: 'nursery-animals', keywords: ['nursery', 'baby room', 'animals'] };

describe('Prompt Builder', () => {
  // ---------------------------------------------------------------------------
  // buildArtworkPrompt
  // ---------------------------------------------------------------------------
  describe('buildArtworkPrompt', () => {
    test('returns non-empty string with artist style', () => {
      const result = buildArtworkPrompt(artist1, testSilo, { subject: 'fox' });
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(10);
      // Artist 1 is "Neon Basquiat Beast" — template/name includes 'basquiat' or 'crown'
      const lower = result.toLowerCase();
      expect(lower.includes('basquiat') || lower.includes('crown')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // injectKeywords
  // ---------------------------------------------------------------------------
  describe('injectKeywords', () => {
    test('fills all template variables', () => {
      const template =
        '{{animal}} with {{color1}}, {{color2}}, {{color3}}, {{color4}}, {{accent_color}}';
      const result = injectKeywords(template, {
        subject: 'cat',
        colors: ['red', 'blue', 'green', 'yellow'],
        trendingKeywords: [],
      });
      expect(result).not.toContain('{{animal}}');
      expect(result).not.toContain('{{color1}}');
      expect(result).not.toContain('{{color2}}');
      expect(result).not.toContain('{{color3}}');
      expect(result).not.toContain('{{color4}}');
      expect(result).not.toContain('{{accent_color}}');
      expect(result).toContain('cat');
      expect(result).toContain('red');
      expect(result).toContain('blue');
      expect(result).toContain('green');
      expect(result).toContain('yellow');
    });

    test('appends trending keywords', () => {
      const template = 'a {{animal}} painting';
      const result = injectKeywords(template, {
        subject: 'bear',
        colors: [],
        trendingKeywords: ['nursery', 'botanical'],
      });
      expect(result).toContain('nursery');
      expect(result).toContain('botanical');
    });
  });

  // ---------------------------------------------------------------------------
  // selectColors
  // ---------------------------------------------------------------------------
  describe('selectColors', () => {
    test('returns 4 colors for valid artist', () => {
      // artist1 has inspirationDNA with Jean-Michel Basquiat at 60% influence
      const colors = selectColors(artist1);
      expect(Array.isArray(colors)).toBe(true);
      expect(colors.length).toBe(4);
      colors.forEach((c) => expect(typeof c).toBe('string'));
    });

    test('returns fallback colors when no DNA', () => {
      const artistNoDNA = { id: 99, name: 'No DNA Artist', inspirationDNA: [] };
      const colors = selectColors(artistNoDNA);
      expect(colors).toEqual(['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4']);
    });
  });

  // ---------------------------------------------------------------------------
  // hasTypography
  // ---------------------------------------------------------------------------
  describe('hasTypography', () => {
    test('detects quote keywords', () => {
      expect(hasTypography('motivational quote wall art')).toBe(true);
    });

    test('returns false for non-typography prompts', () => {
      expect(hasTypography('abstract animal painting')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // isPremium
  // ---------------------------------------------------------------------------
  describe('isPremium', () => {
    test('returns true for midjourney artists', () => {
      const artist = { preferred_engine: 'midjourney' };
      expect(isPremium(artist)).toBe(true);
    });

    test('returns false for flux artists', () => {
      const artist = { preferred_engine: 'flux-schnell' };
      expect(isPremium(artist)).toBe(false);
    });
  });
});
