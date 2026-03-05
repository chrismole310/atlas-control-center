'use strict';

const axios = require('axios');
const BaseAdapter = require('./base-adapter');

class IdeogramAdapter extends BaseAdapter {
  constructor(options = {}) {
    super('ideogram');
    this.apiKey = options.apiKey || process.env.IDEOGRAM_API_KEY;
    this.baseUrl = 'https://api.ideogram.ai/generate';
  }

  async generate({ prompt, aspectRatio, style }) {
    this.logger.info('Generating via Ideogram', { promptLength: prompt.length });

    const { data } = await axios.post(
      this.baseUrl,
      {
        image_request: {
          prompt,
          aspect_ratio: aspectRatio || 'ASPECT_1_1',
          model: 'V_2',
          style_type: style || 'AUTO',
        },
      },
      { headers: { 'Api-Key': this.apiKey, 'Content-Type': 'application/json' } }
    );

    const image = data.data[0];
    return {
      image_url: image.url,
      engine: 'ideogram',
      model: 'ideogram-v2',
    };
  }
}

module.exports = IdeogramAdapter;
