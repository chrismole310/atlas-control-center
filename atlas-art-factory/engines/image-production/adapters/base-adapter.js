'use strict';

const { createLogger } = require('../../../core/logger');

class BaseAdapter {
  constructor(engineName) {
    this.engineName = engineName;
    this.logger = createLogger(`adapter:${engineName}`);
  }

  async generate(options) {
    throw new Error(`${this.engineName}: generate() not implemented`);
  }
}

module.exports = BaseAdapter;
