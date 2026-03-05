'use strict';

const OpenAI = require('openai');
const BaseAdapter = require('./base-adapter');

class DalleAdapter extends BaseAdapter {
  constructor(options = {}) {
    super('dalle3');
    this.client = new OpenAI({ apiKey: options.apiKey || process.env.OPENAI_API_KEY });
  }

  async generate({ prompt, size, quality }) {
    this.logger.info('Generating via DALL-E 3', { promptLength: prompt.length });

    const response = await this.client.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: size || '1024x1024',
      quality: quality || 'standard',
    });

    const image = response.data[0];
    return {
      image_url: image.url,
      engine: 'dalle3',
      model: 'dall-e-3',
      revised_prompt: image.revised_prompt,
    };
  }
}

module.exports = DalleAdapter;
