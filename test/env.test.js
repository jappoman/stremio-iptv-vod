'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { resolveConfig, isConfigured } = require('../src/config');

// Le credenziali NON vengono mai prese da variabili d'ambiente o file .env:
// host, username e password devono sempre arrivare dalla config nell'URL.
const SAVED = {};
beforeEach(() => {
  for (const key of ['IPTV_HOST', 'IPTV_URL', 'IPTV_USERNAME', 'IPTV_PASSWORD', 'PORT']) {
    SAVED[key] = process.env[key];
    delete process.env[key];
  }
});
afterEach(() => {
  for (const key of Object.keys(SAVED)) {
    if (SAVED[key] === undefined) delete process.env[key];
    else process.env[key] = SAVED[key];
  }
});

test('le variabili IPTV_* NON vengono usate come configurazione', () => {
  process.env.IPTV_HOST = 'http://env-host';
  process.env.IPTV_USERNAME = 'env-user';
  process.env.IPTV_PASSWORD = 'env-pass';
  const cfg = resolveConfig({});
  assert.equal(cfg.host, '');
  assert.equal(cfg.username, '');
  assert.equal(cfg.password, '');
  assert.equal(isConfigured(cfg), false);
});

test('senza config nell\'URL l\'addon non è configurato (niente fallback)', () => {
  const cfg = resolveConfig(undefined);
  assert.equal(cfg.host, '');
  assert.equal(cfg.username, '');
  assert.equal(cfg.password, '');
  assert.equal(isConfigured(cfg), false);
});

test('le credenziali arrivano solo dalla config esplicita', () => {
  const cfg = resolveConfig({ host: 'http://h', username: 'u', password: 'p' });
  assert.equal(cfg.host, 'http://h');
  assert.equal(cfg.username, 'u');
  assert.equal(cfg.password, 'p');
  assert.equal(isConfigured(cfg), true);
});
