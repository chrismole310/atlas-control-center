'use strict';

const axios = require('axios');
const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('benchmarker');

const TEST_PROMPTS = [
  'A serene watercolor landscape with mountains and a lake at sunset',
  'Minimalist line art portrait of a woman with flowers in her hair',
  'Cute cartoon animals in a nursery room, pastel colors',
  'Abstract geometric pattern with bold colors, modern art',
  'Typography art with inspirational quote, clean design',
];

async function benchmarkModel({ modelId, source }) {
  logger.info('Benchmarking model', { modelId, source });

  const scores = [];
  const speeds = [];

  for (const prompt of TEST_PROMPTS) {
    try {
      const start = Date.now();

      const { data: prediction } = await axios.post(
        'https://api.replicate.com/v1/predictions',
        { version: modelId, input: { prompt } },
        { headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` } }
      );

      const { data: result } = await axios.get(prediction.urls.get, {
        headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
      });

      const elapsed = Date.now() - start;
      speeds.push(result.metrics?.predict_time ? result.metrics.predict_time * 1000 : elapsed);

      const speedBonus = elapsed < 5000 ? 15 : elapsed < 10000 ? 10 : 0;
      const qualityScore = result.status === 'succeeded' ? 70 + speedBonus : 30;
      scores.push(qualityScore);
    } catch (err) {
      logger.warn(`Benchmark prompt failed for ${modelId}`, { error: err.message });
      scores.push(20);
      speeds.push(30000);
    }
  }

  const avgQuality = scores.reduce((a, b) => a + b, 0) / scores.length;
  const avgSpeed = Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length);
  const overallScore = Math.round(avgQuality * 0.7 + Math.max(0, 100 - avgSpeed / 100) * 0.3);

  await query(
    `UPDATE discovered_models
     SET benchmark_scores = $1, avg_quality_score = $2, avg_speed_ms = $3,
         overall_score = $4, status = 'benchmarked', last_benchmarked = NOW()
     WHERE model_id = $5`,
    [JSON.stringify({ scores, speeds }), avgQuality, avgSpeed, overallScore, modelId]
  );

  logger.info('Benchmark complete', { modelId, avgQuality, avgSpeed, overallScore });
  return { model_id: modelId, avg_quality_score: avgQuality, avg_speed_ms: avgSpeed, overall_score: overallScore, prompts_tested: TEST_PROMPTS.length };
}

module.exports = { benchmarkModel, TEST_PROMPTS };
