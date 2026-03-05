'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('rate-limiter');

class RateLimiter {
  constructor({ platform, maxPerDay = 50, delayMs = 2000 }) {
    this.platform = platform;
    this.maxPerDay = maxPerDay;
    this.delayMs = delayMs;
    this.actionCount = 0;
    this.lastActionTime = 0;
  }

  async canProceed() {
    const { rows } = await query(
      `SELECT COUNT(*) AS count FROM listings
       WHERE platform = $1
       AND published_at >= CURRENT_DATE`,
      [this.platform]
    );

    const todayCount = parseInt(rows[0]?.count || '0', 10);
    const allowed = todayCount < this.maxPerDay;

    if (!allowed) {
      logger.warn(`Rate limit reached for ${this.platform}`, { todayCount, max: this.maxPerDay });
    }

    return allowed;
  }

  async waitForSlot() {
    const now = Date.now();
    const elapsed = now - this.lastActionTime;
    if (elapsed < this.delayMs) {
      await new Promise(r => setTimeout(r, this.delayMs - elapsed));
    }
    this.lastActionTime = Date.now();
  }

  async recordAction() {
    this.actionCount++;
    logger.debug(`Action recorded for ${this.platform}`, { count: this.actionCount });
  }
}

const PLATFORM_LIMITS = {
  etsy: { maxPerDay: 50, delayMs: 3000 },
  gumroad: { maxPerDay: 50, delayMs: 2000 },
  pinterest: { maxPerDay: 25, delayMs: 5000 },
  redbubble: { maxPerDay: 20, delayMs: 10000 },
  society6: { maxPerDay: 20, delayMs: 10000 },
};

function createLimiter(platform) {
  const config = PLATFORM_LIMITS[platform] || { maxPerDay: 50, delayMs: 2000 };
  return new RateLimiter({ platform, ...config });
}

module.exports = { RateLimiter, PLATFORM_LIMITS, createLimiter };
