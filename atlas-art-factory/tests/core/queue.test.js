'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { getQueue, closeQueues, QUEUE_NAMES } = require('../../core/queue');

describe('Bull queue', () => {
  afterAll(async () => {
    await closeQueues();
  });

  test('can create artwork-generation queue', () => {
    const q = getQueue(QUEUE_NAMES.IMAGE_GENERATION);
    expect(q).toBeTruthy();
    expect(q.name).toBe('image-generation');
  });

  test('getQueue returns same singleton', () => {
    const q1 = getQueue(QUEUE_NAMES.IMAGE_GENERATION);
    const q2 = getQueue(QUEUE_NAMES.IMAGE_GENERATION);
    expect(q1).toBe(q2);
  });

  test('Redis is reachable (queue client connects)', async () => {
    const q = getQueue(QUEUE_NAMES.IMAGE_GENERATION);
    // isReady() resolves once the underlying Redis client connects
    await q.isReady();
    expect(true).toBe(true);
  });

  test('QUEUE_NAMES exports all expected queues', () => {
    const expected = ['TREND_SCRAPING', 'MARKET_INTELLIGENCE', 'IMAGE_GENERATION', 'MOCKUP_GENERATION', 'DISTRIBUTION', 'ANALYTICS', 'MODEL_DISCOVERY'];
    expected.forEach(name => {
      expect(QUEUE_NAMES).toHaveProperty(name);
    });
  });

  test('can add and retrieve a job', async () => {
    const q = getQueue('test-task5');
    await q.empty();
    const job = await q.add({ test: true });
    expect(job.id).toBeTruthy();
    const retrieved = await q.getJob(job.id);
    expect(retrieved.data.test).toBe(true);
    await q.empty();
  });
});
