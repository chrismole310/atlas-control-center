'use strict';

const express = require('express');
const { query } = require('../../core/database');
const { runPipeline, openFolder } = require('../generate-pipeline');
const { createLogger } = require('../../core/logger');

const router = express.Router();
const logger = createLogger('api:generate');

// In-memory job store — one job at a time is fine for manual use
const jobs = new Map();

function createJob() {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const job = {
    jobId,
    step: 'market-intel',
    status: 'pending',
    message: 'Starting…',
    progress: 0,
    error: null,
    result: null,
    createdAt: new Date(),
  };
  jobs.set(jobId, job);
  return job;
}

const STEP_PROGRESS = {
  'market-intel':     10,
  'ai-artist':        30,
  'quality-control':  50,
  'mockup-generator': 70,
  'package-builder':  85,
  'publish':          100,
};

// ── POST /api/generate ────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const { siloId } = req.body;

  if (!siloId) {
    return res.status(400).json({ error: 'siloId is required' });
  }

  // Load silo from DB (required — we need the name/description for prompt)
  let silo;
  try {
    const result = await query('SELECT * FROM silos WHERE id = $1', [siloId]);
    if (!result.rows.length) {
      return res.status(404).json({ error: `Silo ${siloId} not found` });
    }
    silo = result.rows[0];
  } catch (err) {
    logger.warn('DB unavailable, cannot load silo', { error: err.message });
    return res.status(503).json({ error: 'Database required to load silo data. Is the Art Factory API running?' });
  }

  const job = createJob();
  logger.info('Generate job created', { jobId: job.jobId, siloId, siloName: silo.name });

  // Run pipeline async — don't await
  runPipeline(silo, (step, status, message) => {
    const j = jobs.get(job.jobId);
    if (!j) return;
    j.step = step;
    j.status = status;
    j.message = message;
    j.progress = status === 'done' ? (STEP_PROGRESS[step] || 0) : Math.max(0, (STEP_PROGRESS[step] || 0) - 10);
  }).then(result => {
    const j = jobs.get(job.jobId);
    if (j) {
      j.status = 'done';
      j.progress = 100;
      j.result = result;
    }
    logger.info('Generate job complete', { jobId: job.jobId, folderPath: result.folderPath });
  }).catch(err => {
    const j = jobs.get(job.jobId);
    if (j) {
      j.status = 'error';
      j.error = err.message;
    }
    logger.error('Generate job failed', { jobId: job.jobId, error: err.message });
  });

  res.json({ jobId: job.jobId });
});

// ── GET /api/generate/:jobId/status ──────────────────────────────────────────

router.get('/:jobId/status', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({
    jobId: job.jobId,
    step: job.step,
    status: job.status,
    message: job.message,
    progress: job.progress,
    error: job.error,
    result: job.result,
  });
});

// ── POST /api/generate/:jobId/open-folder ─────────────────────────────────────

router.post('/:jobId/open-folder', async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.result?.folderPath) return res.status(400).json({ error: 'Job not complete' });

  try {
    await openFolder(job.result.folderPath);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
