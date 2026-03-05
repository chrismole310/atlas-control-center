'use strict';

const SCENE_TEMPLATES = [
  {
    name: 'living-room',
    wallColor: '#F5F0E8',
    canvasWidth: 1200,
    canvasHeight: 900,
    frameArea: { x: 350, y: 100, width: 500, height: 400 },
    frameStyle: { border: 15, borderColor: '#2C2C2C', shadow: true },
    description: 'Modern living room with neutral walls',
  },
  {
    name: 'bedroom',
    wallColor: '#E8E0D8',
    canvasWidth: 1200,
    canvasHeight: 900,
    frameArea: { x: 300, y: 80, width: 600, height: 450 },
    frameStyle: { border: 12, borderColor: '#8B7355', shadow: true },
    description: 'Cozy bedroom with warm tones',
  },
  {
    name: 'office',
    wallColor: '#E0E4E8',
    canvasWidth: 1200,
    canvasHeight: 900,
    frameArea: { x: 380, y: 120, width: 440, height: 350 },
    frameStyle: { border: 10, borderColor: '#333333', shadow: true },
    description: 'Professional office with cool grey walls',
  },
  {
    name: 'nursery',
    wallColor: '#F0E6F6',
    canvasWidth: 1200,
    canvasHeight: 900,
    frameArea: { x: 320, y: 90, width: 560, height: 420 },
    frameStyle: { border: 18, borderColor: '#FFFFFF', shadow: false },
    description: 'Soft nursery with pastel walls',
  },
  {
    name: 'bathroom',
    wallColor: '#F8F8F8',
    canvasWidth: 1200,
    canvasHeight: 900,
    frameArea: { x: 400, y: 130, width: 400, height: 320 },
    frameStyle: { border: 8, borderColor: '#C0C0C0', shadow: true },
    description: 'Clean bathroom with white tile accent',
  },
];

function getSceneTemplates() {
  return SCENE_TEMPLATES;
}

function getSceneConfig(sceneName) {
  return SCENE_TEMPLATES.find(s => s.name === sceneName) || null;
}

module.exports = { getSceneTemplates, getSceneConfig };
