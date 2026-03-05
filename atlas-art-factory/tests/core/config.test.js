'use strict';

const { loadConfig, getSilo, getArtist, getEngine, getPlatform, clearCache } = require('../../core/config');

describe('Config loader', () => {
  beforeEach(() => clearCache());

  test('loads all 6 config files', () => {
    const config = loadConfig();
    expect(config).toHaveProperty('silos');
    expect(config).toHaveProperty('artists');
    expect(config).toHaveProperty('engines');
    expect(config).toHaveProperty('platforms');
    expect(config).toHaveProperty('inspirations');
    expect(config).toHaveProperty('styleClusters');
  });

  test('silos has 50 entries', () => {
    const { silos } = loadConfig();
    // silos is a top-level array
    const arr = Array.isArray(silos) ? silos : silos.silos || silos;
    expect(arr.length).toBe(50);
  });

  test('artists has 50 entries', () => {
    const { artists } = loadConfig();
    // artists is a top-level array
    const arr = Array.isArray(artists) ? artists : artists.artists || artists;
    expect(arr.length).toBe(50);
  });

  test('getSilo returns correct silo by integer id', () => {
    const { silos } = loadConfig();
    const arr = Array.isArray(silos) ? silos : silos.silos || silos;
    const first = arr[0];
    const silo = getSilo(first.id);
    expect(silo).toBeTruthy();
    expect(silo.id).toBe(first.id);
  });

  test('getSilo returns correct silo by name slug', () => {
    const { silos } = loadConfig();
    const arr = Array.isArray(silos) ? silos : silos.silos || silos;
    const first = arr[0];
    const silo = getSilo(first.name);
    expect(silo).toBeTruthy();
    expect(silo.name).toBe(first.name);
  });

  test('getSilo returns null for unknown id', () => {
    expect(getSilo('nonexistent-silo-xyz')).toBeNull();
  });

  test('getArtist returns artist by silo name slug', () => {
    const { artists } = loadConfig();
    const arr = Array.isArray(artists) ? artists : artists.artists || artists;
    const firstSiloName = arr[0].silo;
    const artist = getArtist(firstSiloName);
    expect(artist).toBeTruthy();
    expect(artist.silo).toBe(firstSiloName);
  });

  test('getArtist returns null for unknown silo name', () => {
    expect(getArtist('nonexistent-silo-xyz')).toBeNull();
  });

  test('getEngine returns engine by string key', () => {
    // engines.engines is a keyed object; use the first key
    const { engines } = loadConfig();
    const firstKey = Object.keys(engines.engines)[0];
    const engine = getEngine(firstKey);
    expect(engine).toBeTruthy();
  });

  test('getEngine returns null for unknown engine id', () => {
    expect(getEngine('nonexistent-engine-xyz')).toBeNull();
  });

  test('getPlatform returns platform by string key', () => {
    const { platforms } = loadConfig();
    const firstKey = Object.keys(platforms.platforms)[0];
    const platform = getPlatform(firstKey);
    expect(platform).toBeTruthy();
  });

  test('getPlatform returns null for unknown platform id', () => {
    expect(getPlatform('nonexistent-platform-xyz')).toBeNull();
  });

  test('loadConfig returns same object (cached)', () => {
    const c1 = loadConfig();
    const c2 = loadConfig();
    expect(c1).toBe(c2);
  });

  test('clearCache resets singleton', () => {
    const c1 = loadConfig();
    clearCache();
    const c2 = loadConfig();
    expect(c1).not.toBe(c2);
  });
});
