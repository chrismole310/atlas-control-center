'use strict';

require('dotenv').config();
const { startServer } = require('../api/index');
const { schedule, startAll, stopAll } = require('./scheduler');
const { createLogger } = require('./logger');

const logger = createLogger('orchestrator');

// Placeholder engine imports - filled in as engines are built
async function runTrendScraper()       { logger.info('Trend scraper: not yet implemented'); }
async function runMarketIntelligence() { logger.info('Market intelligence: not yet implemented'); }
async function runImageProduction()    { logger.info('Image production: not yet implemented'); }
async function runDistribution()       { logger.info('Distribution: not yet implemented'); }
async function runAnalytics()          { logger.info('Analytics: not yet implemented'); }
async function runModelDiscovery()     { logger.info('Model discovery: not yet implemented'); }

// Daily schedule
schedule('trend-scraper',        '0 6 * * *',   runTrendScraper);
schedule('market-intelligence',  '0 8 * * *',   runMarketIntelligence);
schedule('image-production',     '30 9 * * *',  runImageProduction);
schedule('distribution',         '0 18 * * *',  runDistribution);
schedule('analytics',            '0 22 * * *',  runAnalytics);
schedule('model-discovery',      '0 2 * * 1',   runModelDiscovery);  // Weekly, Monday 2am

startAll();
startServer();

logger.info('Atlas Art Factory orchestrator started');
logger.info('Schedule: scrape 06:00 | intel 08:00 | generate 09:30 | publish 18:00 | analytics 22:00');

process.on('SIGINT',  () => { stopAll(); process.exit(0); });
process.on('SIGTERM', () => { stopAll(); process.exit(0); });
