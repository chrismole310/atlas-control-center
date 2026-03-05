'use strict';

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn().mockResolvedValue(null),
          fill: jest.fn().mockResolvedValue(null),
          click: jest.fn().mockResolvedValue(null),
          setInputFiles: jest.fn().mockResolvedValue(null),
          waitForSelector: jest.fn().mockResolvedValue(null),
          waitForNavigation: jest.fn().mockResolvedValue(null),
          url: jest.fn().mockReturnValue('https://www.redbubble.com/works/123'),
          textContent: jest.fn().mockResolvedValue('123'),
          close: jest.fn().mockResolvedValue(null),
        }),
        close: jest.fn().mockResolvedValue(null),
      }),
      close: jest.fn().mockResolvedValue(null),
    }),
  },
}));

const RedbubbleUploader = require('../../../engines/distribution/uploaders/redbubble');
const Society6Uploader = require('../../../engines/distribution/uploaders/society6');

describe('RedbubbleUploader', () => {
  test('upload creates listing via Playwright', async () => {
    const uploader = new RedbubbleUploader({
      email: 'test@test.com',
      password: 'test-pass',
    });

    const result = await uploader.upload({
      title: 'Test Art',
      description: 'Beautiful art',
      tags: ['wall art'],
      imagePath: '/tmp/art.png',
    });

    expect(result.platform).toBe('redbubble');
    expect(result).toHaveProperty('platformListingId');
  });
});

describe('Society6Uploader', () => {
  test('upload creates listing via Playwright', async () => {
    const uploader = new Society6Uploader({
      email: 'test@test.com',
      password: 'test-pass',
    });

    const result = await uploader.upload({
      title: 'Test Art',
      description: 'Beautiful art',
      tags: ['wall art'],
      imagePath: '/tmp/art.png',
    });

    expect(result.platform).toBe('society6');
    expect(result).toHaveProperty('platformListingId');
  });
});
