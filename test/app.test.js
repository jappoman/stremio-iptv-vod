'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../src/app');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const enc = (o) => encodeURIComponent(JSON.stringify(o));
const CFG = { host: 'http://iptv.test', username: 'user', password: 'pass' };

test('GET / serves the configuration page', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const body = await res.text();
  assert.ok(body.includes('IPTV VOD'));
  assert.ok(body.includes('IPTV server URL'));
});

test('GET /configure serves the configuration page', async () => {
  const res = await fetch(`${base}/configure`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
});

test('GET /<config>/configure pre-fills the form', async () => {
  const res = await fetch(`${base}/${enc(CFG)}/configure`);
  assert.equal(res.status, 200);
  const body = await res.text();
  // the prefill is embedded as escaped JSON in the page
  assert.ok(body.includes('iptv.test'));
});

test('GET /healthz returns 200 with ok:true', async () => {
  const res = await fetch(`${base}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('GET /manifest.json returns a valid Stremio manifest', async () => {
  const res = await fetch(`${base}/manifest.json`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  const man = await res.json();
  assert.equal(man.id, 'community.iptvvod');
  assert.ok(Array.isArray(man.resources));
  assert.ok(Array.isArray(man.types));
  assert.ok(man.logo && man.logo.startsWith('http://'));
});

test('GET /manifest.json honors X-Forwarded-Proto (trust proxy)', async () => {
  const res = await fetch(`${base}/manifest.json`, {
    headers: { 'X-Forwarded-Proto': 'https' },
  });
  const man = await res.json();
  assert.ok(man.logo.startsWith('https://'));
});

test('GET /<config>/manifest.json strips configuration hints', async () => {
  const res = await fetch(`${base}/${enc(CFG)}/manifest.json`);
  assert.equal(res.status, 200);
  const man = await res.json();
  assert.equal(man.behaviorHints.configurable, undefined);
  assert.equal(man.behaviorHints.configurationRequired, undefined);
  // the base manifest (no config) still advertises configurability
  const plain = await (await fetch(`${base}/manifest.json`)).json();
  assert.equal(plain.behaviorHints.configurable, true);
});

test('POST /api/test without credentials returns 400', async () => {
  const res = await fetch(`${base}/api/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
});

test('POST /api/test reads the JSON body', async () => {
  // only the 400 path is tested: a full test would need real IPTV credentials
  const res = await fetch(`${base}/api/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host: '  ', username: 'u', password: 'p' }),
  });
  assert.equal(res.status, 400);
});

test('GET /public/icon.png serves the static icon', async () => {
  const res = await fetch(`${base}/public/icon.png`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /image\/png/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.length > 1000, 'icon should be a non-trivial PNG');
  assert.equal(buf[0], 0x89); // PNG magic
  assert.equal(buf[1], 0x50);
});

test('GET /healthz/ (trailing slash) also works with default Express routing', async () => {
  const res = await fetch(`${base}/healthz/`);
  assert.equal(res.status, 200); // Express default: strict routing off
});
