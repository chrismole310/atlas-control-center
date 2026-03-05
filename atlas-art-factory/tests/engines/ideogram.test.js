'use strict';

// Mock fs before requiring the module under test
jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  createWriteStream: jest.fn(() => ({
    on: jest.fn((event, cb) => { if (event === 'finish') cb(); }),
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
          handler();
        }
      }),
    };
    callback(mockResponse);
    return { on: jest.fn() };
  }),
}));

// Mock axios
jest.mock('axios');
const axios = require('axios');

const FAKE_IMAGE_URL = 'https://ideogram.ai/assets/image/fake.png';

beforeEach(() => {
  jest.clearAllMocks();
  axios.post = jest.fn().mockResolvedValue({
    data: {
      data: [{ url: FAKE_IMAGE_URL }],
    },
  });
});

const { generate } = require('../../engines/4-ai-artist/engines/ideogram');

// ---------------------------------------------------------------------------
// Core tests
// ---------------------------------------------------------------------------

describe('generate (Ideogram)', () => {
  test('generate calls ideogram API with correct headers', async () => {
    process.env.IDEOGRAM_API_KEY = 'test-ideogram-key';

    await generate('a botanical print', { outputId: 'test_ideo_1' });

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = axios.post.mock.calls[0];
    expect(url).toBe('https://api.ideogram.ai/generate');
    expect(config.headers['Api-Key']).toBe('test-ideogram-key');
    expect(config.headers['Content-Type']).toBe('application/json');
  });

  test('generate sends correct request body', async () => {
    await generate('colorful abstract art', { outputId: 'test_ideo_body' });

    const [, body] = axios.post.mock.calls[0];
    expect(body.image_request).toBeDefined();
    expect(body.image_request.prompt).toBe('colorful abstract art');
    expect(body.image_request.model).toBe('V_2');
    expect(body.image_request.magic_prompt_option).toBe('AUTO');
  });

  test('generate returns correct shape', async () => {
    const result = await generate('minimalist line art', { outputId: 'test_shape' });

    expect(result).toHaveProperty('id', 'test_shape');
    expect(result).toHaveProperty('file_path');
    expect(result.file_path).toMatch(/test_shape\.png$/);
    expect(result).toHaveProperty('engine', 'ideogram');
    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');
    expect(result).toHaveProperty('prompt', 'minimalist line art');
    expect(result).toHaveProperty('url', FAKE_IMAGE_URL);
  });

  test('generate uses default aspect ratio when none provided', async () => {
    await generate('abstract art', { outputId: 'test_defaults' });

    const [, body] = axios.post.mock.calls[0];
    expect(body.image_request.aspect_ratio).toBe('ASPECT_2_3');
  });

  test('generate uses custom aspect ratio when provided', async () => {
    await generate('wide art', { aspectRatio: 'ASPECT_16_9', outputId: 'test_aspect' });

    const [, body] = axios.post.mock.calls[0];
    expect(body.image_request.aspect_ratio).toBe('ASPECT_16_9');
  });

  test('generate generates a unique id when outputId not provided', async () => {
    const result = await generate('unique id art');

    expect(result.id).toMatch(/^ideogram_\d+$/);
  });
});

// ---------------------------------------------------------------------------
// Error-path tests
// ---------------------------------------------------------------------------

describe('generate (Ideogram) error paths', () => {
  test('generate throws with context on API error', async () => {
    axios.post.mockRejectedValueOnce(new Error('unauthorized'));

    await expect(generate('test prompt', { outputId: 'err_test_1' })).rejects.toThrow(
      'Ideogram generation failed'
    );
  });

  test('generate throws with context on API response error', async () => {
    const axiosError = new Error('Request failed with status code 422');
    axiosError.response = { data: { error: 'Invalid aspect ratio' } };
    axios.post.mockRejectedValueOnce(axiosError);

    await expect(generate('bad prompt', { outputId: 'err_test_2' })).rejects.toThrow(
      'Ideogram generation failed'
    );
  });
});
