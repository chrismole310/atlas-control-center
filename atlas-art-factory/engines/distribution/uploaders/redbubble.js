'use strict';

const { chromium } = require('playwright');
const BaseUploader = require('./base-uploader');

class RedbubbleUploader extends BaseUploader {
  constructor(options = {}) {
    super('redbubble');
    this.email = options.email || process.env.REDBUBBLE_EMAIL;
    this.password = options.password || process.env.REDBUBBLE_PASSWORD;
  }

  async upload({ title, description, tags, imagePath }) {
    this.logger.info('Uploading to Redbubble via Playwright', { title });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto('https://www.redbubble.com/auth/login');
      await page.fill('input[name="email"]', this.email);
      await page.fill('input[name="password"]', this.password);
      await page.click('button[type="submit"]');
      await page.waitForNavigation();

      await page.goto('https://www.redbubble.com/portfolio/images/new');
      await page.setInputFiles('input[type="file"]', imagePath);
      await page.waitForSelector('.upload-complete', { timeout: 30000 });

      await page.fill('input[name="title"]', title);
      await page.fill('textarea[name="description"]', description);

      for (const tag of (tags || []).slice(0, 15)) {
        await page.fill('input[name="tags"]', tag);
        await page.click('.add-tag');
      }

      await page.click('button.save-work');
      await page.waitForNavigation();

      const workUrl = page.url();
      const workId = workUrl.split('/').pop() || Date.now().toString();

      this.logger.info('Redbubble upload complete', { workId });

      return {
        platform: 'redbubble',
        platformListingId: workId,
        listingUrl: workUrl,
      };
    } finally {
      await browser.close();
    }
  }
}

module.exports = RedbubbleUploader;
