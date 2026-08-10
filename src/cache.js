'use strict';

/**
 * Cache in-memory con scadenza TTL ed eviction LRU-ish (per inserimento).
 * Ogni voce memorizza { value, expiresAt }. Alla lettura le voci scadute
 * vengono rimosse; quando si supera maxEntries viene eliminata la voce più
 * vecchia (prima inserita).
 */
class TTLCache {
  constructor({ ttlMs = 60 * 1000, maxEntries = Infinity } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    // refresh della posizione (uso recente)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  delete(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }
}

module.exports = { TTLCache };
