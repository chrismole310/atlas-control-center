'use strict';

const axios = require('axios');
const BaseUploader = require('./base-uploader');

class EtsyUploader extends BaseUploader {
  constructor(options = {}) {
    super('etsy');
    this.apiKey = options.apiKey || process.env.ETSY_API_KEY;
    this.shopId = options.shopId || process.env.ETSY_SHOP_ID;
    this.accessToken = options.accessToken || process.env.ETSY_ACCESS_TOKEN;
    this.baseUrl = 'https://openapi.etsy.com/v3';
  }

  async upload({ title, description, price, tags, images }) {
    this.logger.info('Creating Etsy listing', { title });

    const { data } = await axios.post(
      `${this.baseUrl}/application/shops/${this.shopId}/listings`,
      {
        title,
        description,
        price: { amount: Math.round(price * 100), divisor: 100, currency_code: 'USD' },
        quantity: 999,
        tags: tags.slice(0, 13),
        who_made: 'i_did',
        when_made: 'made_to_order',
        taxonomy_id: 69150433,
        type: 'download',
        is_digital: true,
      },
      {
        headers: {
          'x-api-key': this.apiKey,
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    this.logger.info('Etsy listing created', { listingId: data.listing_id });

    return {
      platform: 'etsy',
      platformListingId: String(data.listing_id),
      listingUrl: data.url || `https://www.etsy.com/listing/${data.listing_id}`,
    };
  }
}

module.exports = EtsyUploader;
