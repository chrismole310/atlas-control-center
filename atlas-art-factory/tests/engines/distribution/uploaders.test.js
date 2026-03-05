'use strict';

jest.mock('axios', () => ({
  post: jest.fn(),
  put: jest.fn(),
  get: jest.fn(),
  create: jest.fn().mockReturnValue({
    post: jest.fn(),
    put: jest.fn(),
    get: jest.fn(),
  }),
}));

const axios = require('axios');
const EtsyUploader = require('../../../engines/distribution/uploaders/etsy');
const GumroadUploader = require('../../../engines/distribution/uploaders/gumroad');
const PinterestUploader = require('../../../engines/distribution/uploaders/pinterest');

describe('EtsyUploader', () => {
  let uploader;
  beforeEach(() => {
    uploader = new EtsyUploader({ apiKey: 'test-key', shopId: 'test-shop', accessToken: 'test-token' });
    axios.post.mockReset();
    axios.put.mockReset();
  });

  test('createListing posts to Etsy API', async () => {
    axios.post.mockResolvedValueOnce({
      data: { listing_id: 12345, url: 'https://www.etsy.com/listing/12345' },
    });

    const result = await uploader.upload({
      title: 'Test Art Print',
      description: 'Beautiful art print',
      price: 9.99,
      tags: ['wall art', 'print'],
      images: ['https://example.com/img.png'],
    });

    expect(result).toHaveProperty('platformListingId', '12345');
    expect(result).toHaveProperty('listingUrl');
    expect(result.platform).toBe('etsy');
  });
});

describe('GumroadUploader', () => {
  let uploader;
  beforeEach(() => {
    uploader = new GumroadUploader({ accessToken: 'test-token' });
    axios.post.mockReset();
  });

  test('createProduct posts to Gumroad API', async () => {
    axios.post.mockResolvedValueOnce({
      data: { success: true, product: { id: 'gum-123', short_url: 'https://gum.co/abc' } },
    });

    const result = await uploader.upload({
      title: 'Test Art Pack',
      description: 'Digital art pack',
      price: 12.99,
      filePath: '/tmp/package.zip',
    });

    expect(result).toHaveProperty('platformListingId', 'gum-123');
    expect(result.platform).toBe('gumroad');
  });
});

describe('PinterestUploader', () => {
  let uploader;
  beforeEach(() => {
    uploader = new PinterestUploader({ accessToken: 'test-token', boardId: 'board-123' });
    axios.post.mockReset();
  });

  test('createPin posts to Pinterest API', async () => {
    axios.post.mockResolvedValueOnce({
      data: { id: 'pin-456', link: 'https://pinterest.com/pin/456' },
    });

    const result = await uploader.upload({
      title: 'Test Art Pin',
      description: 'Beautiful wall art',
      imageUrl: 'https://example.com/img.png',
      link: 'https://etsy.com/listing/12345',
    });

    expect(result).toHaveProperty('platformListingId', 'pin-456');
    expect(result.platform).toBe('pinterest');
  });
});
