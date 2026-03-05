'use strict';

const { chromium } = require('playwright');
const { createLogger } = require('../../../core/logger');

const logger = createLogger('playwright-base');

const BROWSER_OPTIONS = {
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
};

const PAGE_OPTIONS = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 },
};

/**
 * Launch a Playwright chromium browser.
 * @returns {Promise<Browser>}
 */
async function launchBrowser() {
  return chromium.launch(BROWSER_OPTIONS);
}

/**
 * Create a new page with standard settings.
 * @param {Browser} browser
 * @returns {Promise<Page>}
 */
async function newPage(browser) {
  const context = await browser.newContext({
    userAgent: PAGE_OPTIONS.userAgent,
    viewport: PAGE_OPTIONS.viewport,
  });
  return context.newPage();
}

/**
 * Navigate to URL with retry on timeout.
 * @param {Page} page
 * @param {string} url
 * @param {number} timeout - ms (default 15000)
 */
async function navigate(page, url, timeout = 15000) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
}

module.exports = { launchBrowser, newPage, navigate };
