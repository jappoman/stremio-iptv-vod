'use strict';

/**
 * Resolution of external Stremio IDs (from other catalog addons, e.g.
 * Cinemeta/IMDb, the TMDB addon, Xperience) to the IPTV catalog.
 *
 * Supported formats:
 *   - "tt<imdb>" (Cinemeta/IMDb)      -> Cinemeta meta -> moviedb_id (tmdb)
 *     -> exact match on the Xtream server `tmdb` field; fallback: match by
 *        name+year.
 *   - "tmdb<id>" (TMDB addon, Xperience) -> exact match on the `tmdb` field.
 *
 * Series: the id may include season/episode ("tt0115341:1:1").
 * The episode is resolved by number (season+episode) with a fallback on the
 * episode title provided by Cinemeta.
 */

const iptv = require('./iptv');
const { TTLCache } = require('./cache');

const CINEMETA_BASE = process.env.CINEMETA_BASE || 'https://v3-cinemeta.strem.io';
const CINEMETA_TTL_MS = 24 * 60 * 60 * 1000;
const CINEMETA_FAIL_TTL_MS = 5 * 60 * 1000;
const cinemetaCache = new TTLCache({ ttlMs: CINEMETA_TTL_MS, maxEntries: 3000 });

// ---------------------------------------------------------------------------
// Normalization and name matching
// ---------------------------------------------------------------------------

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(s) {
  return normalize(s).split(/\s+/).filter(Boolean);
}

function firstYear(year) {
  const m = String(year || '').match(/(\d{4})/);
  return m ? m[1] : undefined;
}

/**
 * Matching score between an IPTV item name and the query (title from the
 * external meta). Rules:
 *   - if the name contains a parenthesized year different from the query's,
 *     it is NOT the same title (score 0), even when the tokens match
 *     ("The Godfather" 1972 vs "Part II" 1974);
 *   - with a known year: the year must match AND at least 20% of the query
 *     tokens must be present (or a strong match >= 60% if the name has no
 *     year);
 *   - without a known year: >= 60% of the query tokens.
 * The score includes the "precision" (how many NAME tokens are covered by
 * the query): so "Dragon Ball" beats "Dragon Ball Kai" with equal query
 * coverage.
 */
function scoreName(name, query, year) {
  const nameTokens = tokenize(name);
  const qTokens = tokenize(query);
  if (!nameTokens.length || !qTokens.length) return 0;
  const set = new Set(nameTokens);
  let common = 0;
  for (const t of qTokens) if (set.has(t)) common++;
  if (!common) return 0;

  const containment = common / qTokens.length; // query coverage
  const precision = common / nameTokens.length; // name coverage (tie-break)

  const parenYear = (String(name).match(/\((\d{4})\)/) || [])[1];
  const yearMatch = year ? parenYear === year || nameTokens.includes(year) : false;

  if (year && parenYear && parenYear !== year) return 0;

  if (yearMatch && containment >= 0.2) return 2 + containment;
  if (containment >= 0.6) return 1 + containment + 0.5 * precision;
  return 0;
}

/**
 * Picks the best item: exact tmdb match, with a name sanity check. If the
 * tmdb match is clearly inconsistent with the requested title (no shared
 * tokens or conflicting year -> scoreName 0) and the name match finds a
 * strong candidate (>= 1.5), the name match wins. Translated titles (e.g.
 * "The Godfather" -> "Il Padrino") stay on the tmdb match because the name
 * match finds nothing.
 * Returns { item, via } where via is 'tmdb' | 'name' | null.
 */
function matchWithFallback(list, tmdbId, name, year) {
  const byTmdb = matchByTmdb(list, tmdbId, name, year);
  if (byTmdb) {
    if (name && scoreName(byTmdb.name, name, year) === 0) {
      const byName = pickBestByName(list, name, year);
      if (byName && scoreName(byName.name, name, year) >= 1.5) {
        return { item: byName, via: 'name' };
      }
    }
    return { item: byTmdb, via: 'tmdb' };
  }
  if (!name) return null;
  const byName = pickBestByName(list, name, year);
  return byName ? { item: byName, via: 'name' } : null;
}

function pickBestByName(items, query, year) {
  let best = null;
  let bestScore = 0;
  for (const item of items) {
    const score = scoreName(item.name, query, year);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

/**
 * Finds the entry with the requested tmdb. When multiple entries share the
 * same tmdb (panels with wrong labels) and we have name+year, picks the one
 * whose name best matches the query; otherwise the first in list order.
 */
function matchByTmdb(items, tmdbId, name, year) {
  if (!tmdbId) return null;
  const wanted = String(tmdbId);
  const matches = items.filter((it) => {
    const t = String(it.tmdb || '');
    return t !== '' && t !== '0' && t === wanted;
  });
  if (!matches.length) return null;
  if (!name || matches.length === 1) return matches[0];
  let best = matches[0];
  let bestScore = -Infinity;
  for (const m of matches) {
    const s = scoreName(m.name, name, year);
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Cinemeta
// ---------------------------------------------------------------------------

async function fetchCinemetaMeta(type, id) {
  const key = `${type}|${id}`;
  const hit = cinemetaCache.get(key);
  // null = recent failed attempt: descriptive error, not a valid meta
  if (hit === null) {
    throw new Error(`Cinemeta unavailable for ${id} (a recent attempt failed)`);
  }
  if (hit !== undefined) return hit;
  let res;
  try {
    res = await fetch(`${CINEMETA_BASE}/meta/${type}/${id}.json`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    cinemetaCache.set(key, null, CINEMETA_FAIL_TTL_MS);
    throw new Error(`Cinemeta unreachable: ${e.message}`);
  }
  if (!res.ok) {
    cinemetaCache.set(key, null, CINEMETA_FAIL_TTL_MS);
    throw new Error(`Cinemeta HTTP ${res.status} for ${id}`);
  }
  const data = await res.json();
  const meta = data && data.meta;
  if (!meta || typeof meta !== 'object') {
    cinemetaCache.set(key, null, CINEMETA_FAIL_TTL_MS);
    throw new Error(`Cinemeta: no meta for ${id}`);
  }
  cinemetaCache.set(key, meta);
  return meta;
}

/**
 * Searches an episode inside a season by title (fallback when the
 * season/episode numbers do not match). Returns the episode or null.
 */
function matchEpisodeByTitle(episodes, title) {
  const q = normalize(title);
  if (!q) return null;
  for (const ep of episodes) {
    const t = normalize(ep.title);
    if (t && (t.includes(q) || q.includes(t))) return ep;
  }
  return null;
}

function cinemetaEpisodeTitle(meta, season, episode) {
  const videos = Array.isArray(meta.videos) ? meta.videos : [];
  const video = videos.find(
    (v) => Number(v.season) === season && Number(v.episode) === episode
  );
  if (video && (video.title || video.name)) {
    return String(video.title || video.name);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Resolution to the IPTV catalog
// ---------------------------------------------------------------------------

/** Series match: exact tmdb (with sanity check), then name+year. Returns { item, via }. */
async function matchSeries(cfg, { tmdbId, name, year }) {
  const list = await iptv.getSeries(cfg);
  return matchWithFallback(list, tmdbId, name, year);
}

/** Movie match: exact tmdb (with sanity check), then name+year. Returns { item, via }. */
async function matchMovie(cfg, { tmdbId, name, year }) {
  const list = await iptv.getVodStreams(cfg);
  return matchWithFallback(list, tmdbId, name, year);
}

/**
 * Resolves an external series (tt.../tmdb...) and the requested episode.
 * Returns { seriesInfo, episode, seriesName } or null.
 * If `trace` is an object, every step is recorded (useful for debugging).
 */
async function resolveSeries(cfg, baseId, season, episode, trace) {
  const t = trace || null;
  const step = (name, value) => { if (t) t[name] = value; };
  try {
    let tmdbId;
    let name;
    let year;
    let episodeTitle;

    if (/^tt\d+$/i.test(baseId)) {
      const meta = await fetchCinemetaMeta('series', baseId);
      tmdbId = meta.moviedb_id;
      name = meta.name;
      year = firstYear(meta.year);
      episodeTitle = cinemetaEpisodeTitle(meta, season, episode);
      step('cinemeta', {
        ok: true,
        name,
        year: year || undefined,
        moviedbId: tmdbId || undefined,
        episodeTitle: episodeTitle || undefined,
      });
    } else if (/^tmdb\d+$/i.test(baseId)) {
      tmdbId = baseId.slice(4);
      step('cinemeta', { ok: true, source: 'tmdb-id', tmdbId });
    } else {
      step('cinemeta', { ok: false, error: `unsupported external id: ${baseId}` });
      return null;
    }

    const matched = await matchSeries(cfg, { tmdbId, name, year });
    if (!matched || !matched.item) {
      const seriesList = await iptv.getSeries(cfg);
      step('match', {
        tmdbMatch: !!matchByTmdb(seriesList, tmdbId, name, year),
        nameMatch: name ? !!pickBestByName(seriesList, name, year) : false,
        tmdbId: tmdbId || undefined,
        name: name || undefined,
        year: year || undefined,
        error: 'no series found on the IPTV server',
      });
      return null;
    }
    const series = matched.item;
    const via = matched.via || undefined;
    step('match', {
      tmdbId: tmdbId || undefined,
      via,
      seriesId: series.series_id,
      seriesName: series.name,
    });

    const seriesInfo = await iptv.getSeriesInfo(cfg, series.series_id);
    const episodes = seriesInfo.episodes && typeof seriesInfo.episodes === 'object'
      ? seriesInfo.episodes
      : {};
    const seasonEps = episodes[String(season)] || episodes[season] || [];
    step('seasons', {
      available: Object.keys(episodes).map(Number).sort((a, b) => a - b),
      requested: season,
      episodesInSeason: seasonEps.length,
    });

    let episodeHit = seasonEps.find((e) => Number(e.episode_num) === episode);
    if (!episodeHit && episodeTitle) {
      episodeHit = matchEpisodeByTitle(seasonEps, episodeTitle);
    }
    if (!episodeHit) {
      step('episode', { found: false, requested: episode, episodeTitle: episodeTitle || undefined });
      return null;
    }
    step('episode', {
      found: true,
      episodeId: episodeHit.id,
      title: episodeHit.title || '',
      via: seasonEps.some((e) => Number(e.episode_num) === episode) ? 'number' : 'title',
    });

    return {
      seriesInfo,
      episode: episodeHit,
      seriesName: (seriesInfo.info && seriesInfo.info.name) || series.name || '',
    };
  } catch (e) {
    step('error', e.message);
    throw e;
  }
}

/**
 * Resolves an external movie (tt.../tmdb...).
 * Returns { info, movieData, name } (get_vod_info shape) or null.
 * If `trace` is an object, every step is recorded (useful for debugging).
 */
async function resolveMovie(cfg, baseId, trace) {
  const t = trace || null;
  const step = (name, value) => { if (t) t[name] = value; };
  try {
    let tmdbId;
    let name;
    let year;

    if (/^tt\d+$/i.test(baseId)) {
      const meta = await fetchCinemetaMeta('movie', baseId);
      tmdbId = meta.moviedb_id;
      name = meta.name;
      year = firstYear(meta.year);
      step('cinemeta', {
        ok: true,
        name,
        year: year || undefined,
        moviedbId: tmdbId || undefined,
      });
    } else if (/^tmdb\d+$/i.test(baseId)) {
      tmdbId = baseId.slice(4);
      step('cinemeta', { ok: true, source: 'tmdb-id', tmdbId });
    } else {
      step('cinemeta', { ok: false, error: `unsupported external id: ${baseId}` });
      return null;
    }

    const matched = await matchMovie(cfg, { tmdbId, name, year });
    if (!matched || !matched.item) {
      const vodList = await getVodList(cfg);
      step('match', {
        tmdbMatch: !!matchByTmdb(vodList, tmdbId, name, year),
        nameMatch: name ? !!pickBestByName(vodList, name, year) : false,
        tmdbId: tmdbId || undefined,
        name: name || undefined,
        year: year || undefined,
        error: 'no movie found on the IPTV server',
      });
      return null;
    }
    const movie = matched.item;
    const via = matched.via || undefined;
    step('match', {
      tmdbId: tmdbId || undefined,
      via,
      streamId: movie.stream_id,
      movieName: movie.name,
    });

    const data = await iptv.getVodInfo(cfg, movie.stream_id);
    return {
      info: (data && data.info) || {},
      movieData: (data && data.movie_data) || {},
      name: movie.name || '',
    };
  } catch (e) {
    step('error', e.message);
    throw e;
  }
}

/** Helper for the trace: VOD list (cached). */
async function getVodList(cfg) {
  return iptv.getVodStreams(cfg);
}

module.exports = {
  resolveSeries,
  resolveMovie,
  scoreName,
  normalize,
  tokenize,
  matchEpisodeByTitle,
  fetchCinemetaMeta,
  matchWithFallback,
};
