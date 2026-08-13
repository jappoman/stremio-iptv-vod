'use strict';

/**
 * Local / Docker entry point: starts the HTTP server.
 * The AWS Lambda handler lives in src/lambda.js and reuses the same app.
 */

const { app } = require('./app');

const PORT = parseInt(process.env.PORT || '7000', 10);

app.listen(PORT, () => {
  console.log(`📺 IPTV VOD addon listening on http://127.0.0.1:${PORT}/manifest.json`);
  console.log(`⚙️  Configuration page: http://127.0.0.1:${PORT}/`);
});
