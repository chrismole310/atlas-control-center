'use strict';

// Mock fs before requiring the module under test
jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  createWriteStream: jest.fn(() => ({
    on: jest.fn((event, cb) => { if (event === 'finish') cb(); }),
    pipe: jest.fn(),
  })),
}));

// Mock https — preserve Agent so openai's transitive deps don't break
jest.mock('https', () => {
  const realHttps = jest.requireActual('https');
  return {
    ...realHttps,
    get: jest.fn((url, callback) => {
      const mockResponse = {
        pipe: jest.fn(),
        on: jest.fn((event, handler) => {
          if (event === 'end') {
            handler();
          }
        }),
      };
      callback(mockResponse);
      return { on: jest.fn() };
    }),
  };
});

// Mock the openai package with a manual factory so real module internals are never executed
jest.mock('openai', () => {
  const mockImagesGenerate = jest.fn();
  const MockOpenAI = jest.fn().mockImplementation(() => ({
    images: { generate: mockImagesGenerate },
  }));
  MockOpenAI._mockImagesGenerate = mockImagesGenerate;
  return MockOpenAI;
});

const OpenAI = require('openai');

const FAKE_IMAGE_URL = 'https://example.com/img.png';

beforeEach(() => {
  jest.clearAllMocks();
  OpenAI._mockImagesGenerate.mockResolvedValue({ data: [{ url: FAKE_IMAGE_URL }] });
  OpenAI.mockImplementation(() => ({
    images: { generate: OpenAI._mockImagesGenerate },
  }));
});

const { generate } = require('../../engines/4-ai-artist/engines/dalle3');

// ---------------------------------------------------------------------------
// Core tests
// ---------------------------------------------------------------------------

describe('generate (DALL-E 3)', () => {
  test('generate calls openai with correct model', async () => {
    await generate('a beautiful mountain landscape', { outputId: 'test_dalle3_1' });

    expect(OpenAI._mockImagesGenerate).toHaveBeenCalledTimes(1);
    const callArgs = OpenAI._mockImagesGenerate.mock.calls[0][0];
    expect(callArgs.model).toBe('dall-e-3');
  });

  test('generate returns correct shape', async () => {
    const result = await generate('minimalist botanical print', { outputId: 'test_shape' });

    expect(result).toHaveProperty('id', 'test_shape');
    expect(result).toHaveProperty('file_path');
    expect(result.file_path).toMatch(/test_shape\.png$/);
    expect(result).toHaveProperty('engine', 'dalle3');
    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');
    expect(result).toHaveProperty('prompt', 'minimalist botanical print');
    expect(result).toHaveProperty('url', FAKE_IMAGE_URL);
  });

  test('generate maps portrait dimensions correctly', async () => {
    // height > width => 1024x1792
    const result = await generate('portrait art', { width: 600, height: 900, outputId: 'test_portrait' });

    const callArgs = OpenAI._mockImagesGenerate.mock.calls[0][0];
    expect(callArgs.size).toBe('1024x1792');
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1792);
  });

  test('generate maps landscape dimensions correctly', async () => {
    // width > height => 1792x1024
    const result = await generate('landscape art', { width: 1200, height: 600, outputId: 'test_landscape' });

    const callArgs = OpenAI._mockImagesGenerate.mock.calls[0][0];
    expect(callArgs.size).toBe('1792x1024');
    expect(result.width).toBe(1792);
    expect(result.height).toBe(1024);
  });

  test('generate uses square size for square dimensions', async () => {
    const result = await generate('square art', { width: 512, height: 512, outputId: 'test_square' });

    const callArgs = OpenAI._mockImagesGenerate.mock.calls[0][0];
    expect(callArgs.size).toBe('1024x1024');
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
  });

  test('generate uses default square size when no dimensions provided', async () => {
    await generate('default art', { outputId: 'test_defaults' });

    const callArgs = OpenAI._mockImagesGenerate.mock.calls[0][0];
    expect(callArgs.size).toBe('1024x1024');
  });

  test('generate passes quality option to API', async () => {
    await generate('hd art', { quality: 'hd', outputId: 'test_hd' });

    const callArgs = OpenAI._mockImagesGenerate.mock.calls[0][0];
    expect(callArgs.quality).toBe('hd');
  });

  test('generate defaults to standard quality', async () => {
    await generate('standard art', { outputId: 'test_standard' });

    const callArgs = OpenAI._mockImagesGenerate.mock.calls[0][0];
    expect(callArgs.quality).toBe('standard');
  });
});

// ---------------------------------------------------------------------------
// Error-path tests
// ---------------------------------------------------------------------------

describe('generate (DALL-E 3) error paths', () => {
  test('generate throws with context on API error', async () => {
    OpenAI._mockImagesGenerate.mockRejectedValueOnce(new Error('rate limit exceeded'));

    await expect(generate('test prompt', { outputId: 'err_test_1' })).rejects.toThrow(
      'DALL-E 3 generation failed'
    );
  });
});
