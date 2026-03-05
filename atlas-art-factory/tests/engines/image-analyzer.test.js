'use strict';

jest.mock('node-vibrant');
jest.mock('axios');

const Vibrant = require('node-vibrant');
const axios = require('axios');
const { extractColorPalette, enrichWithColors } = require('../../engines/1-trend-scraper/image-analyzer');

// Mock Vibrant palette
const MOCK_PALETTE = {
  Vibrant:     { hex: '#FF6B35', population: 1200, rgb: [255, 107, 53] },
  DarkVibrant: { hex: '#C84B00', population: 800, rgb: [200, 75, 0] },
  LightVibrant: { hex: '#FFB38A', population: 600, rgb: [255, 179, 138] },
  Muted:       { hex: '#C87A5A', population: 400, rgb: [200, 122, 90] },
  DarkMuted:   { hex: '#7A3A20', population: 300, rgb: [122, 58, 32] },
  LightMuted:  null, // Can be null
};

const MOCK_IMAGE_BUFFER = Buffer.from('fake-image-data');

describe('Image analyzer', () => {
  beforeEach(() => {
    axios.get.mockResolvedValue({ data: MOCK_IMAGE_BUFFER });
    Vibrant.from = jest.fn().mockReturnValue({
      getPalette: jest.fn().mockResolvedValue(MOCK_PALETTE),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('extractColorPalette returns palette object for valid URL', async () => {
    const result = await extractColorPalette('https://example.com/image.jpg');
    expect(result).not.toBeNull();
    expect(result.dominant).toBeTruthy();
    expect(Array.isArray(result.swatches)).toBe(true);
    expect(result.tone).toMatch(/^(warm|cool|neutral)$/);
    expect(result.brightness).toMatch(/^(light|dark|mid)$/);
  });

  test('returns null for null/empty URL', async () => {
    expect(await extractColorPalette(null)).toBeNull();
    expect(await extractColorPalette('')).toBeNull();
  });

  test('returns null on axios error', async () => {
    axios.get.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await extractColorPalette('https://example.com/bad.jpg');
    expect(result).toBeNull();
  });

  test('returns null on Vibrant error', async () => {
    Vibrant.from.mockReturnValue({
      getPalette: jest.fn().mockRejectedValue(new Error('Invalid image')),
    });
    const result = await extractColorPalette('https://example.com/bad.jpg');
    expect(result).toBeNull();
  });

  test('classifies warm tone correctly (r > b by 30+)', async () => {
    // MOCK_PALETTE dominant is Vibrant: rgb [255, 107, 53] — r=255, b=53, diff=202 → warm
    const result = await extractColorPalette('https://example.com/warm.jpg');
    expect(result.tone).toBe('warm');
  });

  test('swatches array has at most 5 entries', async () => {
    const result = await extractColorPalette('https://example.com/image.jpg');
    expect(result.swatches.length).toBeLessThanOrEqual(5);
  });

  test('enrichWithColors populates color_palette for records with images', async () => {
    const records = [
      { platform: 'etsy', listing_url: 'https://etsy.com/1', title: 'Fox', image_urls: ['https://example.com/fox.jpg'] },
      { platform: 'etsy', listing_url: 'https://etsy.com/2', title: 'Cat', image_urls: [] },
    ];
    const enriched = await enrichWithColors(records);
    expect(enriched[0].color_palette).not.toBeNull();
    expect(enriched[1].color_palette).toBeUndefined(); // no image, no palette added
  });

  test('enrichWithColors handles empty records', async () => {
    const result = await enrichWithColors([]);
    expect(result).toEqual([]);
  });
});
