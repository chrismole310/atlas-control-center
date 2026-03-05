'use strict';

jest.mock('sharp', () => {
  const mockSharp = jest.fn().mockReturnValue({
    resize: jest.fn().mockReturnThis(),
    extend: jest.fn().mockReturnThis(),
    flatten: jest.fn().mockReturnThis(),
    composite: jest.fn().mockReturnThis(),
    png: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-composite-image')),
    metadata: jest.fn().mockResolvedValue({ width: 1024, height: 1024, format: 'png' }),
  });
  return mockSharp;
});

jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({ data: Buffer.from('fake-image-data') }),
}));

const { placeArtOnScene } = require('../../../engines/mockup-generator/art-placer');

test('placeArtOnScene returns buffer of composited image', async () => {
  const result = await placeArtOnScene({
    artworkUrl: 'https://example.com/artwork.png',
    scene: 'living-room',
  });
  expect(result).toHaveProperty('buffer');
  expect(result).toHaveProperty('scene');
  expect(result.scene).toBe('living-room');
  expect(Buffer.isBuffer(result.buffer)).toBe(true);
});

test('placeArtOnScene uses custom frame dimensions', async () => {
  const result = await placeArtOnScene({
    artworkUrl: 'https://example.com/artwork.png',
    scene: 'bedroom',
    frameWidth: 400,
    frameHeight: 300,
  });
  expect(result.buffer).toBeTruthy();
});

test('placeArtOnScene throws for invalid scene', async () => {
  await expect(placeArtOnScene({
    artworkUrl: 'https://example.com/artwork.png',
    scene: 'invalid-scene',
  })).rejects.toThrow('Unknown scene');
});
