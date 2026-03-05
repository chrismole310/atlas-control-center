'use strict';

const axios = require('axios');
const BaseAdapter = require('./base-adapter');

class ReplicateAdapter extends BaseAdapter {
  constructor(options = {}) {
    super('replicate');
    this.apiToken = options.apiToken || process.env.REPLICATE_API_TOKEN;
    this.baseUrl = 'https://api.replicate.com/v1';
    this.pollIntervalMs = options.pollIntervalMs ?? 2000;
    this.maxPollAttempts = options.maxPollAttempts || 60;
  }

  async generate({ prompt, model, width, height, negativePrompt, numOutputs }) {
    this.logger.info(`Generating via ${model}`, { promptLength: prompt.length });

    const input = { prompt };
    if (width) input.width = width;
    if (height) input.height = height;
    if (negativePrompt) input.negative_prompt = negativePrompt;
    if (numOutputs) input.num_outputs = numOutputs;

    const { data: prediction } = await axios.post(
      `${this.baseUrl}/predictions`,
      { version: model, input },
      { headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' } }
    );

    const result = await this._pollPrediction(prediction.urls.get);

    if (result.status === 'failed') {
      throw new Error(result.error || 'Replicate prediction failed');
    }

    const outputs = Array.isArray(result.output) ? result.output : [result.output];
    return {
      image_url: outputs[0],
      all_urls: outputs,
      engine: 'replicate',
      model,
      prediction_id: prediction.id,
    };
  }

  async _pollPrediction(url) {
    for (let i = 0; i < this.maxPollAttempts; i++) {
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${this.apiToken}` },
      });
      if (data.status === 'succeeded' || data.status === 'failed') return data;
      await new Promise(r => setTimeout(r, this.pollIntervalMs));
    }
    throw new Error('Replicate prediction timed out');
  }
}

module.exports = ReplicateAdapter;
