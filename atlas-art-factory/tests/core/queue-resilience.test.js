'use strict';

const { getRetryOptions, getDeadLetterConfig, wrapWithRetry } = require('../../core/queue-resilience');

test('getRetryOptions returns exponential backoff config', () => {
  const opts = getRetryOptions();
  expect(opts).toHaveProperty('attempts');
  expect(opts).toHaveProperty('backoff');
  expect(opts.attempts).toBe(3);
  expect(opts.backoff.type).toBe('exponential');
});

test('getRetryOptions accepts custom attempts', () => {
  const opts = getRetryOptions({ attempts: 5 });
  expect(opts.attempts).toBe(5);
});

test('getDeadLetterConfig returns DLQ queue name', () => {
  const config = getDeadLetterConfig('image-generation');
  expect(config).toHaveProperty('deadLetterQueue');
  expect(config.deadLetterQueue).toBe('image-generation:dlq');
});

test('wrapWithRetry wraps async fn with error logging', async () => {
  const fn = jest.fn().mockResolvedValue({ success: true });
  const wrapped = wrapWithRetry(fn, 'test-task');
  const result = await wrapped({ data: {} });
  expect(result).toEqual({ success: true });
  expect(fn).toHaveBeenCalled();
});

test('wrapWithRetry rethrows errors for Bull retry', async () => {
  const fn = jest.fn().mockRejectedValue(new Error('fail'));
  const wrapped = wrapWithRetry(fn, 'test-task');
  await expect(wrapped({ data: {} })).rejects.toThrow('fail');
});
