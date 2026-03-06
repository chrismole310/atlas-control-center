'use strict';

/**
 * One-time Etsy OAuth setup script (PKCE flow)
 *
 * Usage: node etsy-oauth-setup.js
 *
 * Prerequisites (set in .env before running):
 *   ETSY_API_KEY=your-keystring
 *   ETSY_API_SECRET=your-shared-secret
 *   ETSY_SHOP_ID=your-numeric-shop-id
 *
 * Redirect URI registered in Etsy developer portal: http://localhost:3099/oauth/callback
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const url = require('url');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const PORT = 3099;
const REDIRECT_URI = `http://localhost:${PORT}/oauth/callback`;
const SCOPES = 'listings_w listings_r shops_r';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const AUTH_URL = 'https://www.etsy.com/oauth/connect';
const ENV_PATH = path.join(__dirname, '.env');

const { ETSY_API_KEY } = process.env;

if (!ETSY_API_KEY) {
  console.error('❌  ETSY_API_KEY not set in .env — add it and re-run.');
  process.exit(1);
}

// PKCE helpers
function base64urlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateCodeVerifier() {
  return base64urlEncode(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64urlEncode(hash);
}

function generateState() {
  return base64urlEncode(crypto.randomBytes(16));
}

// Write/update tokens in .env file
function updateEnvFile(tokens) {
  let contents = '';
  if (fs.existsSync(ENV_PATH)) {
    contents = fs.readFileSync(ENV_PATH, 'utf8');
  }

  const updates = {
    ETSY_ACCESS_TOKEN: tokens.access_token,
    ETSY_REFRESH_TOKEN: tokens.refresh_token,
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

// Exchange auth code for tokens via POST
function exchangeCode(code, codeVerifier) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: ETSY_API_KEY,
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: codeVerifier,
    }).toString();

    const options = {
      hostname: 'api.etsy.com',
      path: '/v3/public/oauth/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) {
            resolve(parsed);
          } else {
            reject(new Error(`Token exchange failed: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Invalid JSON from token endpoint: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Open URL in default browser (macOS / Linux / Windows)
function openBrowser(targetUrl) {
  const { exec } = require('child_process');
  const cmd = process.platform === 'darwin'
    ? `open "${targetUrl}"`
    : process.platform === 'win32'
      ? `start "${targetUrl}"`
      : `xdg-open "${targetUrl}"`;
  exec(cmd);
}

async function main() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const authUrl = `${AUTH_URL}?` + new URLSearchParams({
    response_type: 'code',
    client_id: ETSY_API_KEY,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  }).toString();

  let server;

  const tokenPromise = new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname !== '/oauth/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const { code, state: returnedState, error } = parsed.query;

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>❌ Auth denied: ${error}</h1><p>Close this tab and re-run.</p>`);
        reject(new Error(`Auth denied: ${error}`));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>❌ State mismatch — possible CSRF</h1>');
        reject(new Error('State mismatch'));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>❌ No code received</h1>');
        reject(new Error('No code in callback'));
        return;
      }

      try {
        const tokens = await exchangeCode(code, codeVerifier);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <h1>✅ Etsy OAuth complete!</h1>
          <p>Tokens have been saved to <code>.env</code>.</p>
          <p>You can close this tab.</p>
        `);
        resolve(tokens);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h1>❌ Token exchange failed</h1><pre>${err.message}</pre>`);
        reject(err);
      }
    });

    server.listen(PORT, () => {
      console.log(`\n🔑  Opening Etsy auth in browser...`);
      console.log(`\n   If the browser doesn't open automatically, visit:\n   ${authUrl}\n`);
      openBrowser(authUrl);
    });
  });

  try {
    const tokens = await tokenPromise;
    updateEnvFile(tokens);
    console.log('\n✅  Etsy OAuth complete!');
    console.log('    ETSY_ACCESS_TOKEN and ETSY_REFRESH_TOKEN written to .env');
    console.log('\n    Next step: node test-etsy-publish.js\n');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('\n❌ ', err.message);
  process.exit(1);
});
