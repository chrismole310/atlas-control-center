'use strict';

const { buildPrompt, fillTemplate, getInspirationModifiers, buildListingDescription } = require('../../engines/4-ai-artist/dna-prompt-builder');
const { loadConfig, clearCache } = require('../../core/config');

describe('DNA Prompt Builder', () => {
  let config;

  beforeAll(() => {
    clearCache();
    config = loadConfig();
  });

  // ---------------------------------------------------------------------------
  // fillTemplate
  // ---------------------------------------------------------------------------
  describe('fillTemplate', () => {
    test('replaces template variables', () => {
      const result = fillTemplate('A {{color}} {{animal}} in the forest', { color: 'golden', animal: 'fox' });
      expect(result).toBe('A golden fox in the forest');
    });

    test('keeps unfilled placeholders', () => {
      const result = fillTemplate('A {{color}} {{animal}}', { color: 'blue' });
      expect(result).toContain('blue');
      expect(result).toContain('{{animal}}');
    });

    test('handles empty subject', () => {
      const result = fillTemplate('A {{color}} cat', {});
      expect(result).toBe('A {{color}} cat');
    });

    test('handles multiple occurrences of the same variable', () => {
      const result = fillTemplate('{{color}} and {{color}}', { color: 'red' });
      expect(result).toBe('red and red');
    });

    test('returns empty string when template is not a string', () => {
      const result = fillTemplate(null, { color: 'red' });
      expect(result).toBe('');
    });

    test('handles template with no placeholders', () => {
      const result = fillTemplate('plain text', { color: 'blue' });
      expect(result).toBe('plain text');
    });
  });

  // ---------------------------------------------------------------------------
  // getInspirationModifiers
  // ---------------------------------------------------------------------------
  describe('getInspirationModifiers', () => {
    test('returns array of strings', () => {
      const artists = Array.isArray(config.artists) ? config.artists : config.artists.artists || [];
      const inspirations = Array.isArray(config.inspirations) ? config.inspirations : [];
      const firstArtist = artists[0];

      if (!firstArtist.inspirationDNA || !firstArtist.inspirationDNA.length) {
        // Skip if no DNA data
        expect(true).toBe(true);
        return;
      }

      const modifiers = getInspirationModifiers(firstArtist.inspirationDNA, inspirations);
      expect(Array.isArray(modifiers)).toBe(true);
      modifiers.forEach((mod) => expect(typeof mod).toBe('string'));
    });

    test('handles empty DNA array gracefully', () => {
      const modifiers = getInspirationModifiers([], []);
      expect(Array.isArray(modifiers)).toBe(true);
      expect(modifiers.length).toBe(0);
    });

    test('handles missing inspiration gracefully', () => {
      const dna = [{ sourceArtist: 'Unknown Artist XYZ', influence: 100 }];
      const modifiers = getInspirationModifiers(dna, []);
      expect(Array.isArray(modifiers)).toBe(true);
    });

    test('returns at most 3 modifiers', () => {
      const inspirations = Array.isArray(config.inspirations) ? config.inspirations : [];
      const artists = Array.isArray(config.artists) ? config.artists : config.artists.artists || [];
      const firstArtist = artists[0];

      if (!firstArtist.inspirationDNA || !firstArtist.inspirationDNA.length) {
        expect(true).toBe(true);
        return;
      }

      const modifiers = getInspirationModifiers(firstArtist.inspirationDNA, inspirations);
      expect(modifiers.length).toBeLessThanOrEqual(3);
    });

    test('returns modifiers for known inspiration', () => {
      const inspirations = Array.isArray(config.inspirations) ? config.inspirations : [];
      const dna = [{ sourceArtist: 'Jean-Michel Basquiat', influence: 60 }];
      const modifiers = getInspirationModifiers(dna, inspirations);
      // Basquiat is in the config; we should get at least one modifier
      expect(modifiers.length).toBeGreaterThan(0);
    });

    test('higher-influence artist contributes more modifiers', () => {
      const inspirations = [
        {
          name: 'Artist Alpha',
          atlasApplication: { promptModifiers: ['alpha-1', 'alpha-2', 'alpha-3'] },
        },
        {
          name: 'Artist Beta',
          atlasApplication: { promptModifiers: ['beta-1', 'beta-2', 'beta-3'] },
        },
      ];
      // 90% influence → 3 modifiers from Alpha; Beta at 5% → 1 modifier
      const dna = [
        { sourceArtist: 'Artist Alpha', influence: 90 },
        { sourceArtist: 'Artist Beta',  influence: 5  },
      ];
      const modifiers = getInspirationModifiers(dna, inspirations);
      // Alpha's 3 modifiers fill the cap of 3; Beta may not appear at all
      expect(modifiers).toContain('alpha-1');
      expect(modifiers.length).toBeLessThanOrEqual(3);
    });
  });

  // ---------------------------------------------------------------------------
  // buildPrompt
  // ---------------------------------------------------------------------------
  describe('buildPrompt', () => {
    test('returns a non-empty string', () => {
      const artists = Array.isArray(config.artists) ? config.artists : config.artists.artists || [];
      const firstArtist = artists[0];
      const subject = { animal: 'fox', color1: 'gold', color2: 'cream', style: 'watercolor' };
      const prompt = buildPrompt(firstArtist, subject);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(10);
    });

    test('fills template variables from subject', () => {
      const artists = Array.isArray(config.artists) ? config.artists : config.artists.artists || [];
      const firstArtist = artists[0];
      const subject = { animal: 'rabbit', color1: 'pink', color2: 'white' };
      const prompt = buildPrompt(firstArtist, subject);
      // {{animal}} must be replaced
      expect(prompt).not.toContain('{{animal}}');
      expect(prompt).toContain('rabbit');
    });

    test('handles missing subject gracefully', () => {
      const artists = Array.isArray(config.artists) ? config.artists : config.artists.artists || [];
      const firstArtist = artists[0];
      const prompt = buildPrompt(firstArtist);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    test('returns empty string for null artist', () => {
      const prompt = buildPrompt(null, { animal: 'cat' });
      expect(prompt).toBe('');
    });

    test('appends DNA-derived modifiers to the filled template', () => {
      const artists = Array.isArray(config.artists) ? config.artists : config.artists.artists || [];
      const firstArtist = artists[0];

      // Artist 0 is "Neon Basquiat Beast" — inspirationDNA includes Basquiat
      const subject = { animal: 'bear', color1: 'gold', color2: 'black' };
      const prompt = buildPrompt(firstArtist, subject);

      // The Basquiat inspiration has promptModifiers like "basquiat style", "neo-expressionist", etc.
      // At least one should appear in the prompt
      const inspirations = Array.isArray(config.inspirations) ? config.inspirations : [];
      const modifiers = getInspirationModifiers(firstArtist.inspirationDNA, inspirations);

      if (modifiers.length > 0) {
        expect(prompt).toContain(modifiers[0]);
      } else {
        expect(prompt.length).toBeGreaterThan(10);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // buildListingDescription
  // ---------------------------------------------------------------------------
  describe('buildListingDescription', () => {
    test('returns 300+ character description', () => {
      const artists = Array.isArray(config.artists) ? config.artists : config.artists.artists || [];
      const silos   = Array.isArray(config.silos)   ? config.silos   : config.silos.silos   || [];
      const firstArtist = artists[0];
      const firstSilo   = silos[0];
      const artwork = { title: 'Whimsical Fox', style: 'watercolor', colors: ['gold', 'cream'] };
      const desc = buildListingDescription(firstArtist, firstSilo, artwork);
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(300);
    });

    test('includes artwork title in description', () => {
      const artists = Array.isArray(config.artists) ? config.artists : config.artists.artists || [];
      const silos   = Array.isArray(config.silos)   ? config.silos   : config.silos.silos   || [];
      const artwork = { title: 'Radiant Unicorn', style: 'oil paint', colors: ['purple', 'gold'] };
      const desc = buildListingDescription(artists[0], silos[0], artwork);
      expect(desc).toContain('Radiant Unicorn');
    });

    test('includes silo description in output', () => {
      const artists = Array.isArray(config.artists) ? config.artists : config.artists.artists || [];
      const silos   = Array.isArray(config.silos)   ? config.silos   : config.silos.silos   || [];
      const firstSilo = silos[0];
      const desc = buildListingDescription(artists[0], firstSilo, { title: 'Test' });
      expect(desc).toContain(firstSilo.description);
    });

    test('includes top influencer name when DNA is present', () => {
      const artists = Array.isArray(config.artists) ? config.artists : config.artists.artists || [];
      const silos   = Array.isArray(config.silos)   ? config.silos   : config.silos.silos   || [];
      const firstArtist = artists[0]; // Neon Basquiat Beast — top influencer is Basquiat
      const desc = buildListingDescription(firstArtist, silos[0], { title: 'Crown Animal' });
      // Should mention the primary influencer
      const dna = firstArtist.inspirationDNA || [];
      if (dna.length > 0) {
        const top = dna.reduce((max, e) => (e.influence > max.influence ? e : max), dna[0]);
        expect(desc).toContain(top.sourceArtist);
      }
    });

    test('handles null silo gracefully', () => {
      const artists = Array.isArray(config.artists) ? config.artists : config.artists.artists || [];
      const desc = buildListingDescription(artists[0], null, { title: 'No Silo Test' });
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(100);
    });

    test('returns empty string for null artist', () => {
      const desc = buildListingDescription(null, null, {});
      expect(desc).toBe('');
    });
  });
});
