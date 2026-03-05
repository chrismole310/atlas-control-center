'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('../../core/database');
const { createLogger } = require('../../core/logger');

const logger = createLogger('seo-optimizer');

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function generateTitle({ artwork, silo }) {
  logger.info('Generating SEO title', { artworkId: artwork.id });

  const client = getClient();
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Generate a short, keyword-rich Etsy listing title for this digital wall art print.

Silo/niche: ${silo.name}
Art description: ${artwork.prompt}

Rules:
- Max 140 characters
- Front-load the most searchable keywords
- Include art type (print, wall art, digital download)
- Use | as separator between keyword groups
- No quotes in the title

Return ONLY the title, nothing else.`,
    }],
  });

  const title = response.content[0].text.trim().slice(0, 140);
  logger.info('Title generated', { title });
  return title;
}

async function generateDescription({ artwork, silo }) {
  logger.info('Generating SEO description', { artworkId: artwork.id });

  const client = getClient();
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Write an Etsy listing description for this digital wall art print.

Title: ${artwork.title}
Silo/niche: ${silo.name}
Art description: ${artwork.prompt}

Rules:
- 300+ words
- Include what the buyer gets (digital download, multiple sizes)
- Mention print sizes available (8x10, 11x14, 16x20, 24x36, square, A4)
- Include room suggestions (living room, bedroom, nursery, office)
- Natural keyword integration
- Warm, professional tone
- Include a "What You'll Receive" section
- End with printing tips

Return ONLY the description text.`,
    }],
  });

  const description = response.content[0].text.trim();
  logger.info('Description generated', { length: description.length });
  return description;
}

async function optimizeTags({ siloId, artwork }) {
  logger.info('Optimizing tags', { artworkId: artwork.id, siloId });

  const { rows } = await query(
    `SELECT keyword, demand_score
     FROM demand_scores
     WHERE silo_id = $1 AND demand_score > 50
     ORDER BY demand_score DESC
     LIMIT 13`,
    [siloId]
  );

  const promptWords = (artwork.prompt || '')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 5);

  const tags = rows.map(r => r.keyword);

  while (tags.length < 13 && promptWords.length > 0) {
    const word = promptWords.shift();
    if (!tags.includes(word)) tags.push(word);
  }

  const genericTags = ['wall art', 'digital download', 'printable art', 'home decor', 'art print'];
  for (const tag of genericTags) {
    if (tags.length >= 13) break;
    if (!tags.includes(tag)) tags.push(tag);
  }

  logger.info('Tags optimized', { count: tags.length });
  return tags.slice(0, 13);
}

module.exports = { generateTitle, generateDescription, optimizeTags };
