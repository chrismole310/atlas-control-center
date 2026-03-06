'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.resolve(__dirname, '../../../.env');
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';

/**
 * Refresh Etsy OAuth access token using refresh_token grant.
 * Updates process.env and persists new tokens to .env file.
 *
 * @throws if refresh fails (caller should re-authenticate via etsy-oauth-setup.js)
 */
async function refreshToken() {
  const { ETSY_API_KEY, ETSY_REFRESH_TOKEN } = process.env;

  if (!ETSY_REFRESH_TOKEN) {
    throw new Error('ETSY_REFRESH_TOKEN not set — run etsy-oauth-setup.js first');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: ETSY_API_KEY,
    refresh_token: ETSY_REFRESH_TOKEN,
  });

  const { data } = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  // Update in-memory env
  process.env.ETSY_ACCESS_TOKEN = data.access_token;
  if (data.refresh_token) {
    process.env.ETSY_REFRESH_TOKEN = data.refresh_token;
  }

  // Persist to .env file
  _writeTokensToEnv(data.access_token, data.refresh_token || ETSY_REFRESH_TOKEN);

  return data;
}

function _writeTokensToEnv(accessToken, refreshToken) {
  if (!fs.existsSync(ENV_PATH)) return;

  let contents = fs.readFileSync(ENV_PATH, 'utf8');

  const updates = {
    ETSY_ACCESS_TOKEN: accessToken,
    ETSY_REFRESH_TOKEN: refreshToken,
  };

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(contents)) {
      contents = contents.replace(regex, `${key}=${value}`);
    } else {
      contents += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(ENV_PATH, contents, 'utf8');
}

module.exports = { refreshToken };
