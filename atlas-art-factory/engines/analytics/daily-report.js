'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('daily-report');

async function generateDailyReport() {
  const today = new Date().toISOString().split('T')[0];
  logger.info('Generating daily report', { date: today });

  const { rows: [summary] } = await query(
    `SELECT * FROM analytics_daily WHERE date = $1`, [today]
  );

  const { rows: topArtworks } = await query(
    `SELECT pm.artwork_id, a.title, SUM(pm.revenue) AS revenue, SUM(pm.sales) AS sales
     FROM performance_metrics pm
     JOIN artworks a ON a.id = pm.artwork_id
     WHERE pm.last_updated::date = $1
     GROUP BY pm.artwork_id, a.title
     ORDER BY revenue DESC
     LIMIT 10`, [today]
  );

  const report = {
    summary: summary || {
      date: today, artworks_created: 0, listings_published: 0,
      total_views: 0, total_sales: 0, gross_revenue: 0, net_revenue: 0, profit: 0,
    },
    top_artworks: topArtworks,
  };

  logger.info('Daily report generated', {
    revenue: report.summary.gross_revenue,
    sales: report.summary.total_sales,
    topArtworks: topArtworks.length,
  });

  return report;
}

module.exports = { generateDailyReport };
