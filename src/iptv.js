'use strict';

/**
 * Client for Xtream Codes compatible IPTV APIs (player_api.php).
 *
 * Endpoints used:
 *   (no action)            -> user_info / server_info (credential check)
 *   action=get_vod_categories -> movie categories
 *   action=get_vod_streams    -> VOD movie list
 *   action=get_series_categories
 *   action=get_series         -> series list
 *   action=get_vod_info       -> movie details (vod_id)
 *   action=get_series_info    -> series details with seasons/episodes (series_id)
 *
 * Direct streaming URLs:
 *   {base}/movie/{user}/{pass}/{stream_id}.{ext}
 *   {base}/series/{user}/{pass}/{episode_id}.{ext}
 *
 * Heavy lists (movies/series) are cached in memory with a TTL; per-title
 * info uses a longer TTL and a bounded size. Caches are keyed by
 * credentials so multiple providers can coexist.
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
  // the password is included: after a credential rotation the old cache
  // must not mask new authentication errors.
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
 * Tries to determine the exact file size (in bytes) with a GET range
 * request `bytes=0-0`. Some servers answer 520 to HEAD but handle Range
 * correctly, so GET is used. Misses are cached with a short TTL (value 0 =
 * unknown size) to avoid re-probing on every stream request against servers
 * that do not support Range.
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
    // release the connection if the body was not consumed
    if (res.body && typeof res.body.cancel === 'function') {
      try { await res.body.cancel(); } catch (e) { /* ignore */ }
    }
  } catch (e) {
    /* server unreachable or timeout: no size */
  }
  sizeCache.set(url, 0, 5 * 60 * 1000); // short negative cache
  return undefined;
}

/**
 * Connection test: checks the credentials and warms the list caches,
 * returning a useful summary for the web configuration page.
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
  } catch (e) { /* non blocking */ }
  try {
    seriesCount = (await getSeries(cfg)).length;
  } catch (e) { /* non blocking */ }
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
