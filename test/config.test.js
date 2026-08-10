'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resolveConfig, parseConfigArg, str, isConfigured } = require('../src/config');

test('str normalizza a stringa trim', () => {
  assert.equal(str('  x  '), 'x');
  assert.equal(str(undefined), '');
  assert.equal(str(null), '');
  assert.equal(str(0), '0');
});

test('resolveConfig: la config dell\'URL vince su tutto', () => {
  const cfg = resolveConfig({
    host: 'http://url-host',
    username: 'url-user',
    password: 'url-pass',
    streamFormat: 'normal',
  });
  assert.equal(cfg.host, 'http://url-host');
  assert.equal(cfg.username, 'url-user');
  assert.equal(cfg.password, 'url-pass');
  assert.equal(cfg.streamFormat, 'normal');
});

test('resolveConfig: streamFormat di default è aio', () => {
  assert.equal(resolveConfig({}).streamFormat, 'aio');
});

test('resolveConfig: streamFormat normal e case-insensitive', () => {
  assert.equal(resolveConfig({ streamFormat: 'normal' }).streamFormat, 'normal');
  assert.equal(resolveConfig({ streamFormat: 'NORMAL' }).streamFormat, 'normal');
  assert.equal(resolveConfig({ streamFormat: '  normal  ' }).streamFormat, 'normal');
  assert.equal(resolveConfig({ streamFormat: 'aio' }).streamFormat, 'aio');
  assert.equal(resolveConfig({ streamFormat: 'boh' }).streamFormat, 'aio'); // valore ignoto -> aio
});

test('resolveConfig: defaultLanguage di default è ita', () => {
  assert.equal(resolveConfig({}).defaultLanguage, 'ita');
});

test('resolveConfig: defaultLanguage none -> undefined (nessuna lingua)', () => {
  assert.equal(resolveConfig({ defaultLanguage: 'none' }).defaultLanguage, undefined);
  assert.equal(resolveConfig({ defaultLanguage: 'NONE' }).defaultLanguage, undefined);
});

test('resolveConfig: defaultLanguage esplicito', () => {
  assert.equal(resolveConfig({ defaultLanguage: 'eng' }).defaultLanguage, 'eng');
  assert.equal(resolveConfig({ defaultLanguage: '  eng  ' }).defaultLanguage, 'eng');
  assert.equal(resolveConfig({ defaultLanguage: 'boh' }).defaultLanguage, 'boh'); // codice ignoto passa, poi languageFromCode non lo mappa
});

test('resolveConfig: password esplicita', () => {
  const cfg = resolveConfig({ host: 'http://h', username: 'u', password: 'mia-pass' });
  assert.equal(cfg.password, 'mia-pass');
});

test('resolveConfig: senza password -> non configurato', () => {
  const cfg = resolveConfig({ host: 'http://h', username: 'u' });
  assert.equal(cfg.password, '');
  assert.equal(isConfigured(cfg), false);
});

test('isConfigured: richiede host, username e password', () => {
  assert.equal(isConfigured({ host: 'http://h', username: 'u', password: 'p' }), true);
  assert.equal(isConfigured({ host: 'http://h', username: 'u', password: '' }), false);
  assert.equal(isConfigured({ host: 'http://h', username: '', password: 'p' }), false);
  assert.equal(isConfigured({ host: '', username: 'u', password: 'p' }), false);
});

test('parseConfigArg: JSON diretto', () => {
  assert.deepEqual(parseConfigArg('{"host":"http://x","username":"u"}'), {
    host: 'http://x',
    username: 'u',
  });
});

test('parseConfigArg: URL-encoded JSON', () => {
  const arg = encodeURIComponent(JSON.stringify({ host: 'http://x', username: 'u' }));
  assert.deepEqual(parseConfigArg(arg), { host: 'http://x', username: 'u' });
});

test('parseConfigArg: base64 JSON', () => {
  const arg = Buffer.from(JSON.stringify({ host: 'http://x' })).toString('base64');
  assert.deepEqual(parseConfigArg(arg), { host: 'http://x' });
});

test('parseConfigArg: oggetto e valori vuoti', () => {
  assert.deepEqual(parseConfigArg({ host: 'http://x' }), { host: 'http://x' });
  assert.deepEqual(parseConfigArg(undefined), {});
  assert.deepEqual(parseConfigArg('undefined'), {});
  assert.deepEqual(parseConfigArg('null'), {});
  assert.deepEqual(parseConfigArg('not-json-at-all'), {});
});
