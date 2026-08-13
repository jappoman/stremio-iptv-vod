'use strict';

/**
 * AWS Lambda handler: exposes the Express app via Lambda Function URL
 * (public, no authentication) using serverless-http.
 *
 * Notes:
 *   - Path parameters, query strings, GET/POST, headers and Content-Type
 *     are preserved by serverless-http for the Function URL payload format;
 *   - req.protocol works because the app sets 'trust proxy' and the Function
 *     URL provides X-Forwarded-Proto: https;
 *   - binary responses (the icon PNG) are base64-encoded via the `binary`
 *     option, which is what Function URL expects for non-text content;
 *   - the video NEVER transits through Lambda: streams returned to Stremio
 *     are direct URLs of the IPTV provider.
 */

const serverless = require('serverless-http');
const { app } = require('./app');

module.exports.handler = serverless(app, {
  binary: ['image/png', 'image/*', 'application/octet-stream'],
});
