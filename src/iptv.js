'use strict';

/**
 * Client per API IPTV compatibili Xtream Codes (player_api.php).
 *
 * Endpoint usati:
 *   (nessuna action)          -> user_info / server_info (verifica credenziali)
 *   action=get_vod_categories -> categorie film
 *   action=get_vod_streams    -> elenco film VOD
 *   action=get_series_categories
 *   action=get_series         -> elenco serie
 *   action=get_vod_info       -> dettagli di un film (vod_id)
 *   action=get_series_info    -> dettagli serie con stagioni/episodi (series_id)
 *
 * URL di streaming diretti:
 *   {base}/movie/{user}/{pass}/{stream_id}.{ext}
 *   {base}/series/{user}/{pass}/{episode_id}.{ext}
 *
 * Le liste pesanti (film/serie) vengono cacheate in memoria con TTL, le info
 * per singolo titolo con TTL più lungo e dimensione limitata. Le cache sono
 * keyate sulle credenziali, così più provider possono coesistere.
 */

const { TTLCache } = require('./cache');

const REQUEST_TIMEOUT_MS = 20 * 1000;
const LIST_TTL_MS = 30 * 60 * 1000;
const CATEGORY_TTL_MS = 6 * 60 * 60 * 1000;
const INFO_TTL_MS = 6 * 60 * 60 * 1000;
const INFO_MAX_ENTRIES = 3000;
const SIZE_TTL_MS = 24 * 60 * 60 * 1000;
const SIZE_MAX_ENTRIES = 5000;

const listCache = new TTLCache({ ttlMs: LIST_TTL_MS });
const categoryCache = new TTLCache({ ttlMs: CATEGORY_TTL_MS });
const infoCache = new TTLCache({ ttlMs: INFO_TTL_MS, maxEntries: INFO_MAX_ENTRIES });
const sizeCache = new TTLCache({ ttlMs: SIZE_TTL_MS, maxEntries: SIZE_MAX_ENTRIES });

function normalizeBaseUrl(host) {
  let url = String(host || '').trim();
  if (url.endsWith('/player_api.php')) url = url.slice(0, -'/player_api.php'.length);
  url = url.replace(/\/+$/, '');
  return url;
}

function apiBase(cfg) {
  return `${normalizeBaseUrl(cfg.host)}/player_api.php`;
}

function cacheKey(cfg, suffix) {
  // la password è inclusa: dopo una rotazione delle credenziali la cache
  // vecchia non maschera i nuovi errori di autenticazione.
  return `${normalizeBaseUrl(cfg.host)}|${cfg.username}|${cfg.password}|${suffix}`;
}

async function apiGet(cfg, params = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  let url;
  try {
    url = new URL(apiBase(cfg));
  } catch (e) {
    throw new Error(`Invalid IPTV host: "${cfg.host}" (a scheme like http:// is required)`);
  }
  url.searchParams.set('username', cfg.username);
  url.searchParams.set('password', cfg.password);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new Error(`Timeout contacting the IPTV server (${normalizeBaseUrl(cfg.host)})`);
    }
    throw new Error(`Unable to reach the IPTV server: ${e.message}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} response from the IPTV server`);
  }
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`Non-JSON response from the IPTV server (${normalizeBaseUrl(cfg.host)})`);
  }
  if (data && typeof data === 'object' && data.user_info) {
    const auth = Number(data.user_info.auth);
    if (auth !== 1) {
      const status = data.user_info.status || 'unauthorized';
      throw new Error(`Authentication failed (${status})`);
    }
  }
  return data;
}

async function withCache(cache, key, loader) {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = await loader();
  cache.set(key, value);
  return value;
}

async function getVodCategories(cfg) {
  const key = cacheKey(cfg, 'vod_categories');
  const data = await withCache(categoryCache, key, () =>
    apiGet(cfg, { action: 'get_vod_categories' })
  );
  return Array.isArray(data) ? data : [];
}

async function getSeriesCategories(cfg) {
  const key = cacheKey(cfg, 'series_categories');
  const data = await withCache(categoryCache, key, () =>
    apiGet(cfg, { action: 'get_series_categories' })
  );
  return Array.isArray(data) ? data : [];
}

async function getVodStreams(cfg) {
  const key = cacheKey(cfg, 'vod_streams');
  const data = await withCache(listCache, key, () =>
    apiGet(cfg, { action: 'get_vod_streams' })
  );
  return Array.isArray(data) ? data : [];
}

async function getSeries(cfg) {
  const key = cacheKey(cfg, 'series');
  const data = await withCache(listCache, key, () =>
    apiGet(cfg, { action: 'get_series' })
  );
  return Array.isArray(data) ? data : [];
}

async function getVodInfo(cfg, streamId) {
  const key = cacheKey(cfg, `vod_info:${streamId}`);
  return withCache(infoCache, key, () =>
    apiGet(cfg, { action: 'get_vod_info', vod_id: streamId })
  );
}

async function getSeriesInfo(cfg, seriesId) {
  const key = cacheKey(cfg, `series_info:${seriesId}`);
  return withCache(infoCache, key, () =>
    apiGet(cfg, { action: 'get_series_info', series_id: seriesId })
  );
}

function movieUrl(cfg, streamId, extension) {
  return `${normalizeBaseUrl(cfg.host)}/movie/${cfg.username}/${cfg.password}/${streamId}.${extension || 'mp4'}`;
}

function episodeUrl(cfg, episodeId, extension) {
  return `${normalizeBaseUrl(cfg.host)}/series/${cfg.username}/${cfg.password}/${episodeId}.${extension || 'mp4'}`;
}

/**
 * Prova a ricavare la dimensione esatta del file (in byte) con una richiesta
 * GET range `bytes=0-0`. Alcuni server rispondono 520 alla HEAD ma gestiscono
 * correttamente il Range: per questo si usa GET. I "miss" vengono cacheati
 * con TTL breve (valore 0 = dimensione ignota) per non riprovare a ogni
 * richiesta stream contro server che non supportano il Range.
 */
async function probeSize(url) {
  const cached = sizeCache.get(url);
  if (cached !== undefined) return cached > 0 ? cached : undefined;
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(2500),
    });
    if (res.status === 206) {
      const contentRange = res.headers.get('content-range') || '';
      const match = contentRange.match(/\/(\d+)$/);
      if (match) {
        const size = parseInt(match[1], 10);
        if (Number.isFinite(size) && size > 0) {
          sizeCache.set(url, size);
          return size;
        }
      }
    }
    // rilascia la connessione se il corpo non è stato consumato
    if (res.body && typeof res.body.cancel === 'function') {
      try { await res.body.cancel(); } catch (e) { /* ignora */ }
    }
  } catch (e) {
    /* server non raggiungibile o timeout: nessuna dimensione */
  }
  sizeCache.set(url, 0, 5 * 60 * 1000); // negative cache breve
  return undefined;
}

/**
 * Test di connessione: verifica le credenziali e riscalda le cache delle
 * liste, ritornando un riepilogo utile per la pagina web di configurazione.
 */
async function testConnection({ host, username, password }) {
  const cfg = { host, username, password };
  const user = await apiGet(cfg, {}, 12 * 1000);
  const ui = (user && user.user_info) || {};
  const [vodCategories, seriesCategories] = await Promise.all([
    getVodCategories(cfg),
    getSeriesCategories(cfg),
  ]);
  let vodCount = 0;
  let seriesCount = 0;
  try {
    vodCount = (await getVodStreams(cfg)).length;
  } catch (e) { /* non bloccante */ }
  try {
    seriesCount = (await getSeries(cfg)).length;
  } catch (e) { /* non bloccante */ }
  return {
    auth: Number(ui.auth) === 1,
    status: ui.status || 'unknown',
    expDate: ui.exp_date ? Number(ui.exp_date) : undefined,
    serverUrl: normalizeBaseUrl(cfg.host),
    vodCategories: vodCategories.length,
    seriesCategories: seriesCategories.length,
    vodCount,
    seriesCount,
  };
}

module.exports = {
  getVodCategories,
  getSeriesCategories,
  getVodStreams,
  getSeries,
  getVodInfo,
  getSeriesInfo,
  movieUrl,
  episodeUrl,
  probeSize,
  testConnection,
  normalizeBaseUrl,
};
