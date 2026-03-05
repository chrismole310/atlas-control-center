'use strict';

jest.mock('sharp');
jest.mock('fs');

// Mock the logger so we can assert on logger.error calls
const mockLoggerError = jest.fn();
jest.mock('../../core/logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: mockLoggerError,
  })),
}));

// Mock room-templates using the resolved path so it intercepts the require
// inside art-placer.js (which uses require('./room-templates') at runtime)
jest.mock('../../engines/5-mockup-generation/room-templates', () => ({
  generateRoomScene: jest.fn(() => Buffer.from('ROOM')),
  getTemplate: jest.fn((id) => {
    if (id === 'unknown-template') return null;
    return {
      id: 'living-room',
      canvasWidth: 1200,
      canvasHeight: 900,
      artZone: { x: 350, y: 80, width: 500, height: 625 },
    };
  }),
  getTemplates: jest.fn(() => [
    { id: 'living-room' },
    { id: 'bedroom' },
    { id: 'office' },
    { id: 'nursery' },
    { id: 'bathroom' },
  ]),
}));

const sharp = require('sharp');
const fs = require('fs');

const mockSharpInstance = {
  resize: jest.fn().mockReturnThis(),
  composite: jest.fn().mockReturnThis(),
  png: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('IMG')),
  toFile: jest.fn().mockResolvedValue({ size: 1000 }),
  metadata: jest.fn().mockResolvedValue({ width: 400, height: 500 }),
};

sharp.mockImplementation(() => mockSharpInstance);

// Mock fs.mkdirSync to be a no-op
fs.mkdirSync = jest.fn();

const { placeArtInRoom, generateAllMockups } = require('../../engines/5-mockup-generation/art-placer');

beforeEach(() => {
  jest.clearAllMocks();
  sharp.mockImplementation(() => mockSharpInstance);
  mockSharpInstance.resize.mockReturnThis();
  mockSharpInstance.composite.mockReturnThis();
  mockSharpInstance.png.mockReturnThis();
  mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('IMG'));
  mockSharpInstance.toFile.mockResolvedValue({ size: 1000 });
  mockSharpInstance.metadata.mockResolvedValue({ width: 400, height: 500 });
  fs.mkdirSync.mockImplementation(() => {});
});

test('placeArtInRoom returns correct shape', async () => {
  const result = await placeArtInRoom('/fake/artwork.png', 'living-room', {
    outputId: 'test_mockup',
  });
  expect(result).toHaveProperty('file_path');
  expect(result).toHaveProperty('template_id', 'living-room');
  expect(result).toHaveProperty('width', 1200);
  expect(result).toHaveProperty('height', 900);
  expect(result.file_path).toContain('test_mockup.png');
});

test('placeArtInRoom throws for unknown template', async () => {
  const { getTemplate } = require('../../engines/5-mockup-generation/room-templates');
  // getTemplate is already mocked to return null for 'unknown-template'
  await expect(placeArtInRoom('/fake/artwork.png', 'unknown-template')).rejects.toThrow(
    'Unknown template: unknown-template'
  );
});

test('placeArtInRoom throws with context when Sharp fails', async () => {
  sharp.mockImplementationOnce(() => { throw new Error('Bad input'); });
  await expect(placeArtInRoom('/fake/artwork.png', 'living-room')).rejects.toThrow(
    'Failed to place art'
  );
});

test('generateAllMockups calls placeArtInRoom for each template', async () => {
  const results = await generateAllMockups('/fake/artwork.png', {
    outputPrefix: 'test_prefix',
  });
  // sharp should have been called multiple times (once per template)
  expect(sharp).toHaveBeenCalled();
  // 5 templates should produce 5 results
  expect(results).toHaveLength(5);
});

test('generateAllMockups returns results array', async () => {
  const results = await generateAllMockups('/fake/artwork.png');
  expect(Array.isArray(results)).toBe(true);
  for (const r of results) {
    expect(r).toHaveProperty('file_path');
    expect(r).toHaveProperty('template_id');
    expect(r).toHaveProperty('width');
    expect(r).toHaveProperty('height');
  }
});

test('generateAllMockups continues when one template fails', async () => {
  const { getTemplates } = require('../../engines/5-mockup-generation/room-templates');
  // Make the second call to toFile fail, then recover
  let callCount = 0;
  mockSharpInstance.toFile.mockImplementation(() => {
    callCount++;
    if (callCount === 2) return Promise.reject(new Error('disk error'));
    return Promise.resolve({ size: 1000 });
  });

  const results = await generateAllMockups('/fake/artwork.png');
  // Should still return results (4 out of 5 succeed)
  expect(Array.isArray(results)).toBe(true);
  expect(results.length).toBe(4);
});

test('generateAllMockups calls logger.error when a template fails', async () => {
  let callCount = 0;
  mockSharpInstance.toFile.mockImplementation(() => {
    callCount++;
    if (callCount === 1) return Promise.reject(new Error('disk error'));
    return Promise.resolve({ size: 1000 });
  });

  await generateAllMockups('/fake/artwork.png');
  expect(mockLoggerError).toHaveBeenCalledWith(
    expect.stringContaining('Mockup failed for template'),
    expect.objectContaining({ error: expect.any(String) })
  );
});
