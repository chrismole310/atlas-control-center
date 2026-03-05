'use strict';

const { createLogger, log } = require('../../core/logger');

describe('Logger', () => {
  let stdoutSpy;
  let stderrSpy;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => {});
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => {});
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  test('createLogger returns object with 4 methods', () => {
    const logger = createLogger('test-module');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  test('info log writes JSON to stdout', () => {
    const logger = createLogger('test-module');
    logger.info('hello world');
    expect(stdoutSpy).toHaveBeenCalled();
    const written = stdoutSpy.mock.calls[0][0];
    const parsed = JSON.parse(written);
    expect(parsed.level).toBe('info');
    expect(parsed.module).toBe('test-module');
    expect(parsed.message).toBe('hello world');
    expect(parsed.ts).toBeTruthy();
  });

  test('error log writes to stderr', () => {
    const logger = createLogger('test-module');
    logger.error('something broke', { code: 500 });
    expect(stderrSpy).toHaveBeenCalled();
    const written = stderrSpy.mock.calls[0][0];
    const parsed = JSON.parse(written);
    expect(parsed.level).toBe('error');
    expect(parsed.data).toEqual({ code: 500 });
  });

  test('log includes module name', () => {
    log('info', 'my-engine', 'test message');
    const written = stdoutSpy.mock.calls[0][0];
    const parsed = JSON.parse(written);
    expect(parsed.module).toBe('my-engine');
  });

  test('data field omitted when empty', () => {
    const logger = createLogger('test-module');
    logger.info('no data message');
    const written = stdoutSpy.mock.calls[0][0];
    const parsed = JSON.parse(written);
    expect(parsed).not.toHaveProperty('data');
  });

  test('debug messages are suppressed at default info level', () => {
    // LOG_LEVEL defaults to 'info' when not set; debug (level 0) < info (level 1) → suppressed
    const logger = createLogger('test-module');
    const callsBefore = stdoutSpy.mock.calls.length;
    logger.debug('this debug message should be filtered');
    // debug is below info threshold, so stdout should NOT have been written to
    expect(stdoutSpy.mock.calls.length).toBe(callsBefore);
  });
});
