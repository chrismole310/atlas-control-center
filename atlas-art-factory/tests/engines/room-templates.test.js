'use strict';

jest.mock('canvas', () => ({
  createCanvas: jest.fn(() => ({
    getContext: jest.fn(() => ({
      fillStyle: '',
      fillRect: jest.fn(),
      strokeStyle: '',
      lineWidth: 0,
      setLineDash: jest.fn(),
      strokeRect: jest.fn(),
    })),
    toBuffer: jest.fn(() => Buffer.from('PNG_DATA')),
  })),
}));

const { getTemplates, getTemplate, generateRoomScene } = require('../../engines/5-mockup-generation/room-templates');

test('getTemplates returns 5 templates', () => {
  const templates = getTemplates();
  expect(Array.isArray(templates)).toBe(true);
  expect(templates).toHaveLength(5);
});

test('getTemplate returns correct template by id', () => {
  const template = getTemplate('living-room');
  expect(template).not.toBeNull();
  expect(template.id).toBe('living-room');
  expect(template.name).toBe('Living Room');
  expect(template.artZone).toBeDefined();
  expect(template.artZone.x).toBe(350);
  expect(template.artZone.y).toBe(80);
  expect(template.artZone.width).toBe(500);
  expect(template.artZone.height).toBe(625);
});

test('getTemplate returns null for unknown id', () => {
  const template = getTemplate('nonexistent');
  expect(template).toBeNull();
});

test('all templates have required fields', () => {
  const templates = getTemplates();
  for (const t of templates) {
    expect(t).toHaveProperty('id');
    expect(t).toHaveProperty('name');
    expect(t).toHaveProperty('canvasWidth');
    expect(t).toHaveProperty('canvasHeight');
    expect(t).toHaveProperty('backgroundColor');
    expect(t).toHaveProperty('wallColor');
    expect(t).toHaveProperty('artZone');
    expect(t.artZone).toHaveProperty('x');
    expect(t.artZone).toHaveProperty('y');
    expect(t.artZone).toHaveProperty('width');
    expect(t.artZone).toHaveProperty('height');
  }
});

test('generateRoomScene returns buffer', () => {
  const { createCanvas } = require('canvas');
  const mockToBuffer = jest.fn(() => Buffer.from('PNG_DATA'));
  createCanvas.mockReturnValue({
    getContext: jest.fn(() => ({
      fillStyle: '',
      fillRect: jest.fn(),
      strokeStyle: '',
      lineWidth: 0,
      setLineDash: jest.fn(),
      strokeRect: jest.fn(),
    })),
    toBuffer: mockToBuffer,
  });

  const buf = generateRoomScene('living-room');
  expect(Buffer.isBuffer(buf)).toBe(true);
  expect(mockToBuffer).toHaveBeenCalledWith('image/png');
});

test('generateRoomScene throws for unknown template', () => {
  expect(() => generateRoomScene('nonexistent')).toThrow('Unknown room template: nonexistent');
});
