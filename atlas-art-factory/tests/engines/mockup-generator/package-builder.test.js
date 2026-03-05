'use strict';

jest.mock('archiver', () => {
  const mockArchive = {
    pipe: jest.fn(),
    file: jest.fn(),
    append: jest.fn(),
    finalize: jest.fn().mockResolvedValue(undefined),
    on: jest.fn().mockImplementation(function(event, cb) {
      if (event === 'end') setTimeout(cb, 10);
      return this;
    }),
    pointer: jest.fn().mockReturnValue(1024),
  };
  return jest.fn().mockReturnValue(mockArchive);
});

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createWriteStream: jest.fn().mockReturnValue({
    on: jest.fn().mockImplementation(function(event, cb) {
      if (event === 'close') setTimeout(cb, 10);
      return this;
    }),
  }),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

const { buildPackage } = require('../../../engines/mockup-generator/package-builder');

test('buildPackage creates ZIP with all files', async () => {
  const result = await buildPackage({
    files: [
      { name: 'art-8x10.png', path: '/tmp/art-8x10.png' },
      { name: 'art-11x14.png', path: '/tmp/art-11x14.png' },
    ],
    outputPath: '/tmp/packages/art-package.zip',
    metadata: { artworkId: 1, title: 'Test Art' },
  });
  expect(result).toHaveProperty('zipPath');
  expect(result).toHaveProperty('fileCount', 2);
});
