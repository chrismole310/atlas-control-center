'use strict';

jest.mock('node-vibrant', () => {
  const mockPalette = {
    Vibrant: { hex: '#E74C3C', population: 100 },
    DarkVibrant: { hex: '#C0392B', population: 80 },
    LightVibrant: { hex: '#F5B7B1', population: 60 },
    Muted: { hex: '#95A5A6', population: 40 },
    DarkMuted: { hex: '#2C3E50', population: 30 },
    LightMuted: { hex: '#D5DBDB', population: 20 },
  };
  return {
    from: jest.fn().mockReturnValue({
      getPalette: jest.fn().mockResolvedValue(mockPalette),
    }),
  };
});

const { analyzeImageColors } = require('../../../engines/trend-scraper/color-analyzer');

test('analyzeImageColors extracts palette from image URL', async () => {
  const result = await analyzeImageColors('https://example.com/img.jpg');
  expect(result).toHaveProperty('dominant');
  expect(result).toHaveProperty('palette');
  expect(Array.isArray(result.palette)).toBe(true);
  expect(result.palette.length).toBeGreaterThan(0);
});

test('analyzeImageColors returns empty palette on error', async () => {
  const Vibrant = require('node-vibrant');
  Vibrant.from.mockReturnValueOnce({
    getPalette: jest.fn().mockRejectedValue(new Error('network error')),
  });
  const result = await analyzeImageColors('https://example.com/bad.jpg');
  expect(result.dominant).toBeNull();
  expect(result.palette).toEqual([]);
});
