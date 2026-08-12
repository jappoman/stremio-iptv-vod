'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { TTLCache } = require('../src/cache');

test('get/set base', () => {
  const c = new TTLCache({ ttlMs: 1000 });
  c.set('a', 1);
  assert.equal(c.get('a'), 1);
  assert.equal(c.get('missing'), undefined);
});

test('TTL expiry', async () => {
  const c = new TTLCache({ ttlMs: 50 });
  c.set('a', 1);
  assert.equal(c.get('a'), 1);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(c.get('a'), undefined);
});

test('per-entry custom TTL', async () => {
  const c = new TTLCache({ ttlMs: 1000 });
  c.set('a', 1, 30);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(c.get('a'), undefined);
});

test('eviction past maxEntries (insertion-order LRU)', () => {
  const c = new TTLCache({ ttlMs: 10000, maxEntries: 3 });
  c.set('a', 1);
  c.set('b', 2);
  c.set('c', 3);
  c.set('d', 4);
  assert.equal(c.get('a'), undefined); // la più vecchia rimossa
  assert.equal(c.get('b'), 2);
  assert.equal(c.get('c'), 3);
  assert.equal(c.get('d'), 4);
  assert.equal(c.size, 3);
});

test('delete and clear', () => {
  const c = new TTLCache({ ttlMs: 1000 });
  c.set('a', 1);
  c.delete('a');
  assert.equal(c.get('a'), undefined);
  c.set('b', 2);
  c.clear();
  assert.equal(c.get('b'), undefined);
});
