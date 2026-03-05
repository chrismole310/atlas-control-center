'use strict';

const sharp = require('sharp');
const axios = require('axios');
const { createLogger } = require('../../core/logger');

const logger = createLogger('quality-controller');

async function scoreImage(imageUrl) {
  const { data: buffer } = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  const image = sharp(buffer);

  const metadata = await image.metadata();
  const stats = await image.stats();

  // Resolution score (0-30): 1024+ = 30, 512 = 15, below = proportional
  const minDim = Math.min(metadata.width || 0, metadata.height || 0);
  const resolutionScore = Math.min(30, Math.round((minDim / 1024) * 30));

  // Color diversity score (0-30): based on channel standard deviations
  const avgStdev = stats.channels.reduce((sum, ch) => sum + ch.stdev, 0) / stats.channels.length;
  const colorDiversityScore = Math.min(30, Math.round((avgStdev / 80) * 30));

  // File size score (0-20): reasonable file size indicates detail
  const fileSize = metadata.size || buffer.length;
  const fileSizeScore = Math.min(20, Math.round((fileSize / 3000000) * 20));

  // Format bonus (0-20): PNG/TIFF get full marks, JPEG gets 15
  const formatScore = ['png', 'tiff'].includes(metadata.format) ? 20 : 15;

  const totalScore = Math.min(100, resolutionScore + colorDiversityScore + fileSizeScore + formatScore);

  logger.debug('Image scored', { imageUrl, totalScore, resolutionScore, colorDiversityScore });

  return {
    total_score: totalScore,
    resolution_score: resolutionScore,
    color_diversity_score: colorDiversityScore,
    file_size_score: fileSizeScore,
    format_score: formatScore,
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
  };
}

async function meetsQualityThreshold(imageUrl, minScore = 80) {
  const result = await scoreImage(imageUrl);
  return result.total_score >= minScore;
}

module.exports = { scoreImage, meetsQualityThreshold };
