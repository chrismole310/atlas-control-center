'use strict';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL || 'info'] ?? LEVELS.info;

function log(level, module, message, data) {
  if (LEVELS[level] < currentLevel) return;
  const entry = { ts: new Date().toISOString(), level, module, message };
  if (data !== undefined && data !== null) entry.data = data;
  const line = JSON.stringify(entry) + '\n';
  if (level === 'error') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

function createLogger(module) {
  return {
    debug: (message, data) => log('debug', module, message, data),
    info:  (message, data) => log('info',  module, message, data),
    warn:  (message, data) => log('warn',  module, message, data),
    error: (message, data) => log('error', module, message, data),
  };
}

module.exports = { log, createLogger };
