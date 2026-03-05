'use strict';

const axios = require('axios');
const BaseUploader = require('./base-uploader');

class GumroadUploader extends BaseUploader {
  constructor(options = {}) {
    super('gumroad');
    this.accessToken = options.accessToken || process.env.GUMROAD_ACCESS_TOKEN;
    this.baseUrl = 'https://api.gumroad.com/v2';
  }

  async upload({ title, description, price, filePath }) {
    this.logger.info('Creating Gumroad product', { title });

    const { data } = await axios.post(
      `${this.baseUrl}/products`,
      {
        access_token: this.accessToken,
        name: title,
        description,
        price: Math.round(price * 100),
        url: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50),
      }
    );

    this.logger.info('Gumroad product created', { productId: data.product.id });

    return {
      platform: 'gumroad',
      platformListingId: data.product.id,
      listingUrl: data.product.short_url,
    };
  }
}

module.exports = GumroadUploader;
