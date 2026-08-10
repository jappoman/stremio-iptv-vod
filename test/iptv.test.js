'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const iptv = require('../src/iptv');

const CFG = { host: 'http://server.test:8080', username: 'u', password: 'p' };

function fakeResponse({ status = 200, json = null, headers = {} } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name] || null },
    body: { cancel: async () => {} },
    json: async () => {
      if (json === null) throw new SyntaxError('Unexpected token < in JSON');
      return json;
    },
  };
}

const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = originalFetch;
});

test('probeSize: 206 con content-range -> dimensione', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return fakeResponse({ status: 206, headers: { 'content-range': 'bytes 0-0/2531446446' } });
  };
  assert.equal(await iptv.probeSize('http://x/movie/u/p/1.mp4'), 2531446446);
  assert.equal(calls, 1);
});

test('probeSize: miss cacheato (niente secondo fetch)', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return fakeResponse({ status: 200, json: { ok: 1 } }); // server ignora il Range
  };
  assert.equal(await iptv.probeSize('http://x/movie/u/p/2.mp4'), undefined);
  assert.equal(await iptv.probeSize('http://x/movie/u/p/2.mp4'), undefined);
  assert.equal(calls, 1, 'il secondo tentativo deve usare la negative cache');
});

test('probeSize: errore di rete -> undefined', async () => {
  global.fetch = async () => {
    throw new Error('ECONNREFUSED');
  };
  assert.equal(await iptv.probeSize('http://x/movie/u/p/3.mp4'), undefined);
});

test('apiGet: auth ok (user_info.auth=1)', async () => {
  global.fetch = async () =>
    fakeResponse({ json: { user_info: { auth: '1', status: 'Active' }, server_info: {} } });
  const data = await iptv.testConnection({ host: 'http://s', username: 'u', password: 'p' });
  assert.equal(data.auth, true);
  assert.equal(data.status, 'Active');
});

test('apiGet: auth fallita lancia errore', async () => {
  global.fetch = async () =>
    fakeResponse({ json: { user_info: { auth: '0', status: 'Disabled' } } });
  await assert.rejects(
    iptv.testConnection({ host: 'http://s', username: 'u', password: 'p' }),
    /Autenticazione fallita \(Disabled\)/
  );
});

test('apiGet: risposta non JSON -> errore leggibile', async () => {
  global.fetch = async () => fakeResponse({ status: 200, json: null });
  await assert.rejects(
    iptv.testConnection({ host: 'http://s', username: 'u', password: 'p' }),
    /Risposta non JSON/
  );
});

test('apiGet: host senza schema -> errore leggibile', async () => {
  await assert.rejects(
    iptv.testConnection({ host: 'server-senza-schema', username: 'u', password: 'p' }),
    /Host IPTV non valido/
  );
});

test('apiGet: timeout -> errore leggibile', async () => {
  global.fetch = async () => {
    const e = new Error('timeout');
    e.name = 'TimeoutError';
    throw e;
  };
  await assert.rejects(
    iptv.testConnection({ host: 'http://s', username: 'u', password: 'p' }),
    /Timeout contattando il server IPTV/
  );
});
