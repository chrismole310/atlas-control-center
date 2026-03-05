'use strict';

const { chromium } = require('playwright');
const BaseUploader = require('./base-uploader');

class Society6Uploader extends BaseUploader {
  constructor(options = {}) {
    super('society6');
    this.email = options.email || process.env.SOCIETY6_EMAIL;
    this.password = options.password || process.env.SOCIETY6_PASSWORD;
  }

  async upload({ title, description, tags, imagePath }) {
    this.logger.info('Uploading to Society6 via Playwright', { title });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto('https://society6.com/login');
      await page.fill('input[name="email"]', this.email);
      await page.fill('input[name="password"]', this.password);
      await page.click('button[type="submit"]');
      await page.waitForNavigation();

      await page.goto('https://society6.com/studio/upload');
      await page.setInputFiles('input[type="file"]', imagePath);
      await page.waitForSelector('.upload-success', { timeout: 30000 });

      await page.fill('input[name="title"]', title);
      await page.fill('textarea[name="description"]', description);

      const tagStr = (tags || []).slice(0, 20).join(', ');
      await page.fill('input[name="tags"]', tagStr);

      await page.click('button.publish');
      await page.waitForNavigation();

      const artUrl = page.url();
      const artId = artUrl.split('/').pop() || Date.now().toString();

      this.logger.info('Society6 upload complete', { artId });

      return {
        platform: 'society6',
        platformListingId: artId,
        listingUrl: artUrl,
      };
    } finally {
      await browser.close();
    }
  }
}

module.exports = Society6Uploader;
