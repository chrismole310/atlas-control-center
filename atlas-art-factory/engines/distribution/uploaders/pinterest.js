'use strict';

const axios = require('axios');
const BaseUploader = require('./base-uploader');

class PinterestUploader extends BaseUploader {
  constructor(options = {}) {
    super('pinterest');
    this.accessToken = options.accessToken || process.env.PINTEREST_ACCESS_TOKEN;
    this.boardId = options.boardId || process.env.PINTEREST_BOARD_ID;
    this.baseUrl = 'https://api.pinterest.com/v5';
  }

  async upload({ title, description, imageUrl, link }) {
    this.logger.info('Creating Pinterest pin', { title });

    const { data } = await axios.post(
      `${this.baseUrl}/pins`,
      {
        board_id: this.boardId,
        title,
        description,
        link,
        media_source: {
          source_type: 'image_url',
          url: imageUrl,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    this.logger.info('Pinterest pin created', { pinId: data.id });

    return {
      platform: 'pinterest',
      platformListingId: data.id,
      listingUrl: data.link || `https://pinterest.com/pin/${data.id}`,
    };
  }
}

module.exports = PinterestUploader;
