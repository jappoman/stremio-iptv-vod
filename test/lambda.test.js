'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { handler } = require('../src/lambda');

const enc = (o) => encodeURIComponent(JSON.stringify(o));
const CFG = { host: 'http://iptv.test', username: 'user', password: 'pass' };

function fnEvent(method, rawPath, { query = '', headers = {}, body } = {}) {
  return {
    version: '2.0',
    rawPath,
    rawQueryString: query,
    headers: { host: 'abcdef1234.lambda-url.eu-west-1.on.aws', ...headers },
    requestContext: { http: { method, path: rawPath } },
    isBase64Encoded: false,
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  };
}

test('handler: GET /healthz returns 200 with JSON body', async () => {
  const res = await handler(fnEvent('GET', '/healthz'), {});
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] || '', /application\/json/);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
  assert.equal(res.isBase64Encoded, false);
});

test('handler: GET / serves the configuration page', async () => {
  const res = await handler(fnEvent('GET', '/'), {});
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] || '', /text\/html/);
  assert.ok(res.body.includes('IPTV VOD'));
});

test('handler: GET /manifest.json returns a valid manifest and https logo (X-Forwarded-Proto)', async () => {
  const res = await handler(
    fnEvent('GET', '/manifest.json', { headers: { 'x-forwarded-proto': 'https' } }),
    {}
  );
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] || '', /application\/json/);
  // CORS is set by the app itself (not by the Function URL): it must survive
  assert.equal(res.headers['access-control-allow-origin'], '*');
  const man = JSON.parse(res.body);
  assert.equal(man.id, 'community.iptvvod');
  assert.ok(man.logo.startsWith('https://abcdef1234.lambda-url.eu-west-1.on.aws/'));
});

test('handler: GET /<config>/manifest.json strips configuration hints', async () => {
  const res = await handler(fnEvent('GET', `/${enc(CFG)}/manifest.json`), {});
  assert.equal(res.statusCode, 200);
  const man = JSON.parse(res.body);
  assert.equal(man.behaviorHints.configurable, undefined);
});

test('handler: POST /api/test without credentials returns 400', async () => {
  const res = await handler(
    fnEvent('POST', '/api/test', { headers: { 'content-type': 'application/json' }, body: {} }),
    {}
  );
  assert.equal(res.statusCode, 400);
  const data = JSON.parse(res.body);
  assert.equal(data.ok, false);
});

test('handler: GET /public/icon.png returns a binary image (base64)', async () => {
  const res = await handler(fnEvent('GET', '/public/icon.png'), {});
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] || '', /image\/png/);
  assert.equal(res.isBase64Encoded, true);
  const buf = Buffer.from(res.body, 'base64');
  assert.ok(buf.length > 1000);
  assert.equal(buf[0], 0x89); // PNG magic
});

test('handler: unknown route returns 404 with correct statusCode', async () => {
  const res = await handler(fnEvent('GET', '/does-not-exist'), {});
  assert.equal(res.statusCode, 404);
});
