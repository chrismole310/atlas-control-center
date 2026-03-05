'use strict';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info;

function log(level, module, message, data = {}) {
  if (LOG_LEVELS[level] < currentLevel) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    module,
    message,
    ...(Object.keys(data).length > 0 ? { data } : {}),
  };

  const output = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(output + '\n');
  } else {
    process.stdout.write(output + '\n');
  }
}

function createLogger(module) {
  return {
    debug: (msg, data) => log('debug', module, msg, data),
    info:  (msg, data) => log('info',  module, msg, data),
    warn:  (msg, data) => log('warn',  module, msg, data),
    error: (msg, data) => log('error', module, msg, data),
  };
}

module.exports = { createLogger, log };
