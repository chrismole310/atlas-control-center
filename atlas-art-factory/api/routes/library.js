'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { LIBRARY_ROOT } = require('../generate-pipeline');
const { createLogger } = require('../../core/logger');

const router = express.Router();
const logger = createLogger('api:library');
const LIBRARY_RESOLVED = path.resolve(LIBRARY_ROOT);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a library folder name into its parts.
 * "2026-03-06-botanical-prints-342359"
 *   → { date: "2026-03-06", slug: "botanical-prints", id: "342359", folderId: "..." }
 */
function parseFolder(folderName) {
  const parts = folderName.split('-');
  if (parts.length < 5) return null; // need at least YYYY + MM + DD + slug + id
  const date = parts.slice(0, 3).join('-');
  const id = parts[parts.length - 1];
  const slug = parts.slice(3, -1).join('-');
  if (!slug) return null;
  return { date, slug, id, folderId: folderName };
}

/** Read title from listing.txt — returns folder name as fallback */
function readTitle(folderId) {
  try {
    const listingPath = path.join(LIBRARY_ROOT, folderId, 'listing.txt');
    const content = fs.readFileSync(listingPath, 'utf8');
    const line = content.split('\n').find(l => l.startsWith('TITLE:'));
    if (line) return line.replace('TITLE:', '').trim();
  } catch { /* listing.txt missing — use fallback */ }
  return folderId;
}

// NOTE: scanLibrary and readTitle use synchronous fs calls intentionally. The
// library scan runs at most once per API request on a single-user local server
// where blocking the event loop briefly is an acceptable tradeoff over the
// complexity of async directory walking.
/** Scan library and return parsed entries, skipping anything that doesn't match */
function scanLibrary() {
  if (!fs.existsSync(LIBRARY_ROOT)) return [];
  return fs.readdirSync(LIBRARY_ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => parseFolder(e.name))
    .filter(Boolean);
}

/** Verify path stays within LIBRARY_ROOT */
function safePath(...parts) {
  const resolved = path.resolve(LIBRARY_ROOT, ...parts);
  if (!resolved.startsWith(LIBRARY_RESOLVED + path.sep) && resolved !== LIBRARY_RESOLVED) {
    return null;
  }
  return resolved;
}

// ── GET /api/library ──────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  try {
    const entries = scanLibrary();

    // Group by silo slug
    const bySlug = {};
    for (const entry of entries) {
      if (!bySlug[entry.slug]) bySlug[entry.slug] = [];
      bySlug[entry.slug].push(entry);
    }

    const silos = Object.entries(bySlug).map(([slug, pieces]) => {
      const sorted = [...pieces].sort((a, b) => b.date.localeCompare(a.date));
      return {
        slug,
        count: pieces.length,
        latestFolder: sorted[0].folderId,
        latestDate: sorted[0].date,
      };
    });

    res.json({ silos, totalPieces: entries.length });
  } catch (err) {
    logger.error('GET /api/library failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/library/:silo ────────────────────────────────────────────────────

router.get('/:silo', (req, res) => {
  try {
    const { silo } = req.params;
    const pieces = scanLibrary()
      .filter(e => e.slug === silo)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(p => ({ folderId: p.folderId, date: p.date, title: readTitle(p.folderId) }));

    // Empty pieces is valid — silo exists in DB but has no generated art yet
    res.json({ silo, pieces });
  } catch (err) {
    logger.error('GET /api/library/:silo failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/library/:silo/:folderId/artwork ──────────────────────────────────

router.get('/:silo/:folderId/artwork', (req, res) => {
  const { silo, folderId } = req.params;

  // Validate folder belongs to the requested silo
  const parsed = parseFolder(folderId);
  if (!parsed || parsed.slug !== silo) {
    return res.status(400).json({ error: 'Silo mismatch' });
  }

  const artworkPath = safePath(folderId, 'artwork.png');
  if (!artworkPath) return res.status(403).json({ error: 'Forbidden' });

  fs.access(artworkPath, fs.constants.R_OK, (err) => {
    if (err) return res.status(404).json({ error: 'Artwork not found' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const stream = fs.createReadStream(artworkPath);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).json({ error: 'Read error' });
      else res.destroy();
    });
    stream.pipe(res);
  });
});

// ── GET /api/library/:silo/:folderId/mockup/:room ─────────────────────────────

const VALID_ROOMS = new Set(['living-room', 'bedroom', 'office', 'nursery', 'bathroom']);

router.get('/:silo/:folderId/mockup/:room', (req, res) => {
  const { silo, folderId, room } = req.params;

  if (!VALID_ROOMS.has(room)) return res.status(400).json({ error: 'Invalid room' });

  const parsed = parseFolder(folderId);
  if (!parsed || parsed.slug !== silo) {
    return res.status(400).json({ error: 'Silo mismatch' });
  }

  const mockupsDir = safePath(folderId, 'mockups');
  if (!mockupsDir) return res.status(403).json({ error: 'Forbidden' });

  if (!fs.existsSync(mockupsDir)) return res.status(404).json({ error: 'No mockups' });

  const files = fs.readdirSync(mockupsDir).filter(f => f.endsWith(`_${room}.png`));
  if (!files.length) return res.status(404).json({ error: 'Mockup not found' });

  const mockupPath = safePath(folderId, 'mockups', files[0]);
  if (!mockupPath) return res.status(403).json({ error: 'Forbidden' });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  const stream = fs.createReadStream(mockupPath);
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).json({ error: 'Read error' });
    else res.destroy();
  });
  stream.pipe(res);
});

// ── GET /api/library/:silo/:folderId/listing ──────────────────────────────────

router.get('/:silo/:folderId/listing', (req, res) => {
  const { silo, folderId } = req.params;

  const parsed = parseFolder(folderId);
  if (!parsed || parsed.slug !== silo) {
    return res.status(400).json({ error: 'Silo mismatch' });
  }

  const listingPath = safePath(folderId, 'listing.txt');
  if (!listingPath) return res.status(403).json({ error: 'Forbidden' });

  if (!fs.existsSync(listingPath)) return res.status(404).json({ error: 'Listing not found' });

  try {
    const content = fs.readFileSync(listingPath, 'utf8');
    const lines = content.split('\n');

    const title = (lines.find(l => l.startsWith('TITLE:')) || '').replace('TITLE:', '').trim();
    const priceStr = (lines.find(l => l.startsWith('PRICE:')) || '').replace('PRICE:', '').replace('$', '').trim();
    const tagsStr = (lines.find(l => l.startsWith('TAGS:')) || '').replace('TAGS:', '').trim();
    const descStart = lines.findIndex(l => l.trim() === 'DESCRIPTION:');
    const description = descStart >= 0 ? lines.slice(descStart + 1).join('\n').trim() : '';

    res.json({
      title,
      price: parseFloat(priceStr) || 4.99,
      tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean),
      description,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/library/:silo/:folderId/open-folder ─────────────────────────────

router.post('/:silo/:folderId/open-folder', (req, res) => {
  const { folderId } = req.params;

  const folderPath = safePath(folderId);
  if (!folderPath) return res.status(403).json({ error: 'Forbidden' });
  if (!fs.existsSync(folderPath)) return res.status(404).json({ error: 'Folder not found' });

  execFile('open', [folderPath], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

module.exports = router;
