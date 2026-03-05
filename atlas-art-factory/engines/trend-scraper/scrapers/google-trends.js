'use strict';

const googleTrends = require('google-trends-api');
const { createLogger } = require('../../../core/logger');

const logger = createLogger('scraper:google-trends');

class GoogleTrendsScraper {
  constructor(options = {}) {
    this.rateLimitMs = options.rateLimitMs ?? 3000;
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms ?? this.rateLimitMs));
  }

  async scrape(keywords) {
    const results = [];

    for (const keyword of keywords) {
      try {
        logger.info(`Google Trends: "${keyword}"`);

        const interestRaw = await googleTrends.interestOverTime({ keyword, geo: 'US' });
        const interestData = JSON.parse(interestRaw);
        const timeline = interestData?.default?.timelineData || [];

        let interest = 0;
        let trendDirection = 'stable';
        if (timeline.length >= 2) {
          const recent = timeline.slice(-4);
          const values = recent.map(p => p.value[0]);
          interest = values[values.length - 1];
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          if (interest > avg * 1.1) trendDirection = 'rising';
          else if (interest < avg * 0.9) trendDirection = 'declining';
        }

        let relatedQueries = [];
        try {
          const relatedRaw = await googleTrends.relatedQueries({ keyword, geo: 'US' });
          const relatedData = JSON.parse(relatedRaw);
          const lists = relatedData?.default?.rankedList || [];
          for (const list of lists) {
            const items = list.rankedKeyword || [];
            relatedQueries.push(...items.map(i => i.query));
          }
        } catch {
          // Related queries are optional
        }

        results.push({
          keyword,
          interest,
          trend_direction: trendDirection,
          related_queries: relatedQueries.slice(0, 20),
          timeline_length: timeline.length,
        });

        await this.sleep();
      } catch (err) {
        logger.error(`Google Trends failed for "${keyword}"`, { error: err.message });
      }
    }

    return results;
  }
}

module.exports = GoogleTrendsScraper;
