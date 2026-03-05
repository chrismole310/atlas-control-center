'use strict';

const path = require('path');
const fs = require('fs');

const BACKGROUNDS_DIR = path.join(__dirname, '../../storage/room-backgrounds');
const TEMPLATES_META = path.join(BACKGROUNDS_DIR, 'templates.json');

/**
 * Load templates from the generated metadata file.
 * Falls back to hardcoded defaults if the file doesn't exist yet.
 */
function loadTemplates() {
  if (fs.existsSync(TEMPLATES_META)) {
    const raw = fs.readFileSync(TEMPLATES_META, 'utf8');
    const meta = JSON.parse(raw);
    return meta.map(t => ({
      ...t,
      backgroundPath: path.join(BACKGROUNDS_DIR, t.file),
    }));
  }

  // Fallback: hardcoded art zones (used before room backgrounds are generated)
  return [
    { id: 'living-room', label: 'Living Room', canvasWidth: 1360, canvasHeight: 768, artZone: { x: 517, y: 115, width: 354, height: 346 } },
    { id: 'bedroom',     label: 'Bedroom',     canvasWidth: 1360, canvasHeight: 768, artZone: { x: 476, y: 61,  width: 381, height: 323 } },
    { id: 'office',      label: 'Home Office', canvasWidth: 1360, canvasHeight: 768, artZone: { x: 490, y: 77,  width: 367, height: 338 } },
    { id: 'nursery',     label: 'Nursery',     canvasWidth: 1360, canvasHeight: 768, artZone: { x: 503, y: 92,  width: 367, height: 330 } },
    { id: 'bathroom',    label: 'Bathroom',    canvasWidth: 1360, canvasHeight: 768, artZone: { x: 748, y: 115, width: 299, height: 307 } },
  ].map(t => ({
    ...t,
    file: `${t.id}.png`,
    backgroundPath: path.join(BACKGROUNDS_DIR, `${t.id}.png`),
  }));
}

let _templates = null;

function getTemplates() {
  if (!_templates) _templates = loadTemplates();
  return _templates;
}

function getTemplate(id) {
  return getTemplates().find(t => t.id === id) || null;
}

/**
 * Get the background image path for a room template.
 * Used by art-placer.js to composite artwork onto the real photo.
 * @param {string} templateId
 * @returns {string} absolute path to the background PNG
 */
function getRoomBackgroundPath(templateId) {
  const template = getTemplate(templateId);
  if (!template) throw new Error(`Unknown room template: ${templateId}`);
  if (!fs.existsSync(template.backgroundPath)) {
    throw new Error(`Room background not found: ${template.backgroundPath}. Run: node generate-room-backgrounds.js`);
  }
  return template.backgroundPath;
}

module.exports = { getTemplates, getTemplate, getRoomBackgroundPath };
