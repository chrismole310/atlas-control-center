const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[process.env.LOG_LEVEL || 'info'];

function log(level, component, message, data = null) {
  if (levels[level] > currentLevel) return;
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] [${component}] ${message}`;
  if (data) {
    console.log(line, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(line);
  }
}

module.exports = {
  info:  (c, m, d) => log('info',  c, m, d),
  warn:  (c, m, d) => log('warn',  c, m, d),
  error: (c, m, d) => log('error', c, m, d),
  debug: (c, m, d) => log('debug', c, m, d),
};
