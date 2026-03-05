'use strict';

const { getSceneTemplates, getSceneConfig } = require('../../../engines/mockup-generator/scene-templates');

test('getSceneTemplates returns all 5 room types', () => {
  const templates = getSceneTemplates();
  expect(templates).toHaveLength(5);
  const names = templates.map(t => t.name);
  expect(names).toContain('living-room');
  expect(names).toContain('bedroom');
  expect(names).toContain('office');
  expect(names).toContain('nursery');
  expect(names).toContain('bathroom');
});

test('each template has required fields', () => {
  const templates = getSceneTemplates();
  for (const t of templates) {
    expect(t).toHaveProperty('name');
    expect(t).toHaveProperty('wallColor');
    expect(t).toHaveProperty('frameArea');
    expect(t.frameArea).toHaveProperty('x');
    expect(t.frameArea).toHaveProperty('y');
    expect(t.frameArea).toHaveProperty('width');
    expect(t.frameArea).toHaveProperty('height');
  }
});

test('getSceneConfig returns config for valid scene', () => {
  const config = getSceneConfig('living-room');
  expect(config).toBeTruthy();
  expect(config.name).toBe('living-room');
});

test('getSceneConfig returns null for invalid scene', () => {
  const config = getSceneConfig('garage');
  expect(config).toBeNull();
});
