'use strict';
const { createCanvas } = require('@napi-rs/canvas');

// Room template definitions
const ROOM_TEMPLATES = [
  {
    id: 'living-room',
    name: 'Living Room',
    canvasWidth: 1200,
    canvasHeight: 900,
    backgroundColor: '#F5F0EB',  // warm off-white
    wallColor: '#E8E0D5',        // slightly warmer wall
    // Art placement on wall (as pixel coordinates)
    artZone: { x: 350, y: 80, width: 500, height: 625 },
    // Simple furniture hint elements
    furniture: [
      { type: 'rect', x: 200, y: 650, width: 800, height: 200, color: '#8B7355' }, // sofa
      { type: 'rect', x: 500, y: 820, width: 200, height: 60, color: '#6B5D4F' },  // coffee table
    ],
  },
  {
    id: 'bedroom',
    name: 'Bedroom',
    canvasWidth: 1200,
    canvasHeight: 900,
    backgroundColor: '#F0EEF5',  // soft lavender-white
    wallColor: '#E5E0F0',
    artZone: { x: 400, y: 60, width: 400, height: 500 },
    furniture: [
      { type: 'rect', x: 250, y: 620, width: 700, height: 260, color: '#9B8EA0' }, // bed
      { type: 'rect', x: 270, y: 580, width: 660, height: 60, color: '#FFFFFF' },  // pillows
    ],
  },
  {
    id: 'office',
    name: 'Home Office',
    canvasWidth: 1200,
    canvasHeight: 900,
    backgroundColor: '#EEEEF0',  // cool neutral
    wallColor: '#E0E0E5',
    artZone: { x: 380, y: 60, width: 440, height: 550 },
    furniture: [
      { type: 'rect', x: 200, y: 700, width: 800, height: 30, color: '#7D7060' },  // desk surface
      { type: 'rect', x: 400, y: 730, width: 400, height: 160, color: '#5A5A5A' }, // chair
    ],
  },
  {
    id: 'nursery',
    name: 'Nursery',
    canvasWidth: 1200,
    canvasHeight: 900,
    backgroundColor: '#FFF5F0',  // warm peachy-white
    wallColor: '#FFE8D6',
    artZone: { x: 350, y: 60, width: 500, height: 600 },
    furniture: [
      { type: 'rect', x: 300, y: 650, width: 600, height: 220, color: '#C8A882' }, // crib
      { type: 'rect', x: 50, y: 680, width: 150, height: 200, color: '#D4A873' },  // changing table
    ],
  },
  {
    id: 'bathroom',
    name: 'Bathroom',
    canvasWidth: 1200,
    canvasHeight: 900,
    backgroundColor: '#F0F5F5',  // cool spa white
    wallColor: '#E0EDED',
    artZone: { x: 400, y: 60, width: 400, height: 500 },
    furniture: [
      { type: 'rect', x: 50, y: 500, width: 300, height: 380, color: '#B8D4D0' },  // bathtub
      { type: 'rect', x: 850, y: 600, width: 200, height: 280, color: '#A0BCC0' }, // vanity
    ],
  },
];

/**
 * Get all room template definitions.
 * @returns {Array} ROOM_TEMPLATES
 */
function getTemplates() { return ROOM_TEMPLATES; }

/**
 * Get a specific room template by id.
 * @param {string} id
 * @returns {Object|null}
 */
function getTemplate(id) { return ROOM_TEMPLATES.find(t => t.id === id) || null; }

/**
 * Generate a room scene PNG buffer using node-canvas.
 * Renders: background, wall area, furniture hints, art placeholder outline.
 * @param {string} templateId
 * @returns {Buffer} PNG buffer
 */
function generateRoomScene(templateId) {
  const template = getTemplate(templateId);
  if (!template) throw new Error(`Unknown room template: ${templateId}`);

  const canvas = createCanvas(template.canvasWidth, template.canvasHeight);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = template.backgroundColor;
  ctx.fillRect(0, 0, template.canvasWidth, template.canvasHeight);

  // Wall area (upper portion)
  ctx.fillStyle = template.wallColor;
  ctx.fillRect(0, 0, template.canvasWidth, template.canvasHeight * 0.75);

  // Draw furniture hints
  for (const item of template.furniture) {
    ctx.fillStyle = item.color;
    ctx.fillRect(item.x, item.y, item.width, item.height);
  }

  // Art placeholder outline (dashed border in the art zone)
  const az = template.artZone;
  ctx.strokeStyle = '#CCBBAA';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 5]);
  ctx.strokeRect(az.x, az.y, az.width, az.height);
  ctx.setLineDash([]);

  return canvas.toBuffer('image/png');
}

module.exports = { getTemplates, getTemplate, generateRoomScene };
