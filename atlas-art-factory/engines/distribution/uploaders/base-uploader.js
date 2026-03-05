'use strict';

const { createLogger } = require('../../../core/logger');

class BaseUploader {
  constructor(platform) {
    this.platform = platform;
    this.logger = createLogger(`uploader:${platform}`);
  }

  async upload(listing) {
    throw new Error(`${this.platform}: upload() not implemented`);
  }
}

module.exports = BaseUploader;
