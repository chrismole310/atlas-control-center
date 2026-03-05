'use strict';

const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('stats-aggregator');

async function aggregateDailyStats() {
  logger.info('Aggregating daily stats');

  const today = new Date().toISOString().split('T')[0];

  const { rows: [artworks] } = await query(
    `SELECT COUNT(*) AS count FROM artworks WHERE created_at::date = $1`, [today]
  );

  const { rows: [listings] } = await query(
    `SELECT COUNT(*) AS count FROM listings WHERE published_at::date = $1`, [today]
  );

  const { rows: [salesData] } = await query(
    `SELECT COUNT(*) AS total_sales,
            COALESCE(SUM(price), 0) AS gross,
            COALESCE(SUM(net_revenue), 0) AS net
     FROM sales WHERE sale_date::date = $1`, [today]
  );

  const { rows: [metricsData] } = await query(
    `SELECT COALESCE(SUM(views), 0) AS views,
            COALESCE(SUM(clicks), 0) AS clicks,
            COALESCE(SUM(favorites), 0) AS favorites
     FROM performance_metrics WHERE last_updated::date = $1`, [today]
  );

  const artworksCreated = parseInt(artworks?.count || '0', 10);
  const listingsPublished = parseInt(listings?.count || '0', 10);
  const totalSales = parseInt(salesData?.total_sales || '0', 10);
  const grossRevenue = parseFloat(salesData?.gross || '0');
  const netRevenue = parseFloat(salesData?.net || '0');
  const views = parseInt(metricsData?.views || '0', 10);
  const clicks = parseInt(metricsData?.clicks || '0', 10);
  const conversionRate = views > 0 ? totalSales / views : 0;

  await query(
    `INSERT INTO analytics_daily (date, artworks_created, listings_published, total_views, total_clicks,
       total_sales, gross_revenue, net_revenue, conversion_rate, avg_sale_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (date) DO UPDATE SET
       artworks_created = $2, listings_published = $3, total_views = $4, total_clicks = $5,
       total_sales = $6, gross_revenue = $7, net_revenue = $8, conversion_rate = $9, avg_sale_price = $10`,
    [today, artworksCreated, listingsPublished, views, clicks,
     totalSales, grossRevenue, netRevenue, conversionRate,
     totalSales > 0 ? grossRevenue / totalSales : 0]
  );

  const summary = { date: today, artworks_created: artworksCreated, listings_published: listingsPublished,
    total_sales: totalSales, gross_revenue: grossRevenue };
  logger.info('Daily stats aggregated', summary);
  return summary;
}

async function updatePerformanceMetrics() {
  logger.info('Updating performance metrics conversion rates');

  const { rows } = await query(
    `SELECT artwork_id, platform, views, sales FROM performance_metrics WHERE views > 0`
  );

  let updated = 0;
  for (const row of rows) {
    const rate = row.views > 0 ? row.sales / row.views : 0;
    await query(
      `UPDATE performance_metrics SET conversion_rate = $1, last_updated = NOW()
       WHERE artwork_id = $2 AND platform = $3`,
      [rate, row.artwork_id, row.platform]
    );
    updated++;
  }

  logger.info('Performance metrics updated', { metrics_updated: updated });
  return { metrics_updated: updated };
}

module.exports = { aggregateDailyStats, updatePerformanceMetrics };
