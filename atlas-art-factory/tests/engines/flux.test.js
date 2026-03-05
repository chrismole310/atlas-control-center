'use strict';

// Mock fs before requiring the module under test
jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  createWriteStream: jest.fn(() => ({
    on: jest.fn(),
    pipe: jest.fn(),
  })),
}));

// Mock https to resolve immediately without a real network call
jest.mock('https', () => ({
  get: jest.fn((url, callback) => {
    const mockResponse = {
      pipe: jest.fn(),
      on: jest.fn((event, handler) => {
        if (event === 'end') {
          // Fire 'end' synchronously so the promise resolves
          handler();
        }
      }),
    };
    callback(mockResponse);
    return { on: jest.fn() };
  }),
}));

// Mock the replicate package
jest.mock('replicate');
const Replicate = require('replicate');

const FAKE_IMAGE_URL = 'https://example.com/image.png';
const SCHNELL_MODEL = 'black-forest-labs/FLUX.1-schnell';
const DEV_MODEL = 'black-forest-labs/FLUX.1-dev';

let mockRun;

beforeEach(() => {
  jest.clearAllMocks();
  mockRun = jest.fn().mockResolvedValue([FAKE_IMAGE_URL]);
  Replicate.mockImplementation(() => ({ run: mockRun }));
});

const { generateFluxSchnell, generateFluxDev } = require('../../engines/4-ai-artist/engines/flux');

// ---------------------------------------------------------------------------
// FLUX.1 schnell tests
// ---------------------------------------------------------------------------

describe('generateFluxSchnell', () => {
  test('calls replicate.run with correct schnell model', async () => {
    await generateFluxSchnell('a beautiful mountain landscape', { outputId: 'test_schnell_1' });

    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockRun).toHaveBeenCalledWith(
      SCHNELL_MODEL,
      expect.objectContaining({
        input: expect.objectContaining({ prompt: 'a beautiful mountain landscape' }),
      })
    );
    // Verify the exact model name passed
    const [modelArg] = mockRun.mock.calls[0];
    expect(modelArg).toBe(SCHNELL_MODEL);
  });

  test('returns correct result shape', async () => {
    const result = await generateFluxSchnell('minimalist botanical print', { outputId: 'test_shape' });

    expect(result).toHaveProperty('id', 'test_shape');
    expect(result).toHaveProperty('file_path');
    expect(result.file_path).toMatch(/test_shape\.png$/);
    expect(result).toHaveProperty('engine', 'FLUX.1-schnell');
    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');
    expect(result).toHaveProperty('prompt', 'minimalist botanical print');
    expect(result).toHaveProperty('url', FAKE_IMAGE_URL);
  });

  test('uses custom width and height from options', async () => {
    await generateFluxSchnell('abstract art', { width: 512, height: 512, outputId: 'test_dims' });

    expect(mockRun).toHaveBeenCalledWith(
      SCHNELL_MODEL,
      expect.objectContaining({
        input: expect.objectContaining({ width: 512, height: 512 }),
      })
    );
  });

  test('uses default dimensions when none provided', async () => {
    await generateFluxSchnell('cute animals', { outputId: 'test_defaults' });

    expect(mockRun).toHaveBeenCalledWith(
      SCHNELL_MODEL,
      expect.objectContaining({
        input: expect.objectContaining({ width: 2400, height: 3000 }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// FLUX.1 dev tests
// ---------------------------------------------------------------------------

describe('generateFluxDev', () => {
  test('calls replicate.run with correct dev model', async () => {
    await generateFluxDev('vibrant watercolor landscape', { outputId: 'test_dev_1' });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const [modelArg] = mockRun.mock.calls[0];
    expect(modelArg).toBe(DEV_MODEL);
  });

  test('returns correct result shape', async () => {
    const result = await generateFluxDev('geometric abstract art', { outputId: 'test_dev_shape' });

    expect(result).toHaveProperty('id', 'test_dev_shape');
    expect(result).toHaveProperty('file_path');
    expect(result.file_path).toMatch(/test_dev_shape\.png$/);
    expect(result).toHaveProperty('engine', 'FLUX.1-dev');
    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');
    expect(result).toHaveProperty('prompt', 'geometric abstract art');
    expect(result).toHaveProperty('url', FAKE_IMAGE_URL);
  });
});
