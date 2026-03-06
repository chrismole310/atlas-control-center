'use strict';

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const BaseUploader = require('./base-uploader');
const { refreshToken } = require('./etsy-auth');

const BASE_URL = 'https://api.etsy.com/v3';

class EtsyUploader extends BaseUploader {
  constructor(options = {}) {
    super('etsy');
    this.apiKey = options.apiKey || process.env.ETSY_API_KEY;
    this.shopId = options.shopId || process.env.ETSY_SHOP_ID;
  }

  get accessToken() {
    return process.env.ETSY_ACCESS_TOKEN;
  }

  _headers(extra = {}) {
    return {
      'x-api-key': this.apiKey,
      Authorization: `Bearer ${this.accessToken}`,
      ...extra,
    };
  }

  /**
   * Wraps an API call with automatic token refresh on 401.
   */
  async _request(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err.response?.status === 401) {
        this.logger.info('Access token expired — refreshing');
        await refreshToken();
        return fn(); // retry once
      }
      throw err;
    }
  }

  /**
   * Step 1: Create a draft listing (metadata only)
   */
  async _createDraftListing({ title, description, price, tags }) {
    const { data } = await this._request(() =>
      axios.post(
        `${BASE_URL}/application/shops/${this.shopId}/listings`,
        {
          title,
          description,
          price: parseFloat(price),
          quantity: 999,
          tags: tags.slice(0, 13),
          who_made: 'i_did',
          when_made: 'made_to_order',
          taxonomy_id: 2078, // Digital Prints
          type: 'download',
          is_digital: true,
          shipping_profile_id: null,
        },
        { headers: this._headers({ 'Content-Type': 'application/json' }) }
      )
    );
    this.logger.info('Draft listing created', { listingId: data.listing_id });
    return data.listing_id;
  }

  /**
   * Step 2: Upload mockup images (up to 5)
   */
  async _uploadImages(listingId, mockupPaths) {
    const uploads = mockupPaths.slice(0, 5);
    for (let i = 0; i < uploads.length; i++) {
      const imgPath = uploads[i];
      const form = new FormData();
      form.append('image', fs.createReadStream(imgPath), path.basename(imgPath));
      form.append('rank', String(i + 1));

      await this._request(() =>
        axios.post(
          `${BASE_URL}/application/shops/${this.shopId}/listings/${listingId}/images`,
          form,
          { headers: this._headers(form.getHeaders()) }
        )
      );
      this.logger.info(`Image ${i + 1}/${uploads.length} uploaded`, { listingId });
    }
  }

  /**
   * Step 3: Upload digital ZIP file
   */
  async _uploadDigitalFile(listingId, zipPath) {
    const form = new FormData();
    form.append('file', fs.createReadStream(zipPath), path.basename(zipPath));
    form.append('name', path.basename(zipPath));
    form.append('rank', '1');

    await this._request(() =>
      axios.post(
        `${BASE_URL}/application/shops/${this.shopId}/listings/${listingId}/files`,
        form,
        {
          headers: this._headers(form.getHeaders()),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      )
    );
    this.logger.info('Digital file uploaded', { listingId, file: path.basename(zipPath) });
  }

  /**
   * Step 4: Activate the listing
   */
  async _activateListing(listingId) {
    await this._request(() =>
      axios.patch(
        `${BASE_URL}/application/shops/${this.shopId}/listings/${listingId}`,
        { state: 'active' },
        { headers: this._headers({ 'Content-Type': 'application/json' }) }
      )
    );
    this.logger.info('Listing activated', { listingId });
  }

  /**
   * Full publish pipeline: draft → images → digital file → activate
   *
   * @param {Object} opts
   * @param {string} opts.title
   * @param {string} opts.description
   * @param {number|string} opts.price
   * @param {string[]} opts.tags
   * @param {string[]} opts.mockupPaths - absolute paths to room mockup images (up to 5)
   * @param {string|null} opts.zipPath  - absolute path to digital download ZIP
   * @returns {{ platform, platformListingId, listingUrl }}
   */
  async upload({ title, description, price, tags, mockupPaths = [], zipPath = null }) {
    this.logger.info('Starting Etsy publish pipeline', { title });

    const listingId = await this._createDraftListing({ title, description, price, tags });

    if (mockupPaths.length > 0) {
      const existing = mockupPaths.filter(p => fs.existsSync(p));
      if (existing.length > 0) {
        await this._uploadImages(listingId, existing);
      } else {
        this.logger.warn('No mockup images found on disk — listing will have no photos');
      }
    }

    if (zipPath && fs.existsSync(zipPath)) {
      await this._uploadDigitalFile(listingId, zipPath);
    } else if (zipPath) {
      this.logger.warn('ZIP not found — activating without digital file', { zipPath });
    }

    await this._activateListing(listingId);

    return {
      platform: 'etsy',
      platformListingId: String(listingId),
      listingUrl: `https://www.etsy.com/listing/${listingId}`,
    };
  }
}

module.exports = EtsyUploader;
