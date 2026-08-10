'use strict';

/**
 * Risoluzione degli id Stremio esterni (provenienti da altri addon catalogo,
 * es. Cinemeta/IMDb, l'addon TMDB, Xperience) verso il catalogo IPTV.
 *
 * Formati supportati:
 *   - "tt<imdb>" (Cinemeta/IMDb)        -> Cinemeta meta -> moviedb_id (tmdb)
 *     -> match esatto sul campo `tmdb` del server Xtream; fallback: match
 *        per nome+anno.
 *   - "tmdb<id>" (addon TMDB, Xperience)-> match esatto sul campo `tmdb`.
 *
 * Serie: l'id può includere stagione/episodio ("tt0115341:1:1").
 * La risoluzione dell'episodio avviene per numero (stagione+episodio) con
 * fallback sul titolo episodio fornito da Cinemeta.
 */

const iptv = require('./iptv');
const { TTLCache } = require('./cache');

const CINEMETA_BASE = process.env.CINEMETA_BASE || 'https://v3-cinemeta.strem.io';
const CINEMETA_TTL_MS = 24 * 60 * 60 * 1000;
const CINEMETA_FAIL_TTL_MS = 5 * 60 * 1000;
const cinemetaCache = new TTLCache({ ttlMs: CINEMETA_TTL_MS, maxEntries: 3000 });

// ---------------------------------------------------------------------------
// Normalizzazione e matching per nome
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
 * Punteggio di corrispondenza tra il nome di un elemento IPTV e la query
 * (titolo dal meta esterno). Regole:
 *   - se il nome contiene un anno tra parentesi diverso da quello della
 *     query, NON è lo stesso titolo (punteggio 0), anche se i token combaciano
 *     ("The Godfather" 1972 vs "Part II" 1974);
 *   - con anno noto: serve che l'anno combaci E almeno il 20% dei token
 *     della query (oppure match forte >= 60% se il nome non riporta l'anno);
 *   - senza anno noto: >= 60% dei token della query.
 * Il punteggio include la "precisione" (quanti token del NOME sono coperti
 * dalla query): così "Dragon Ball" batte "Dragon Ball Kai" a parità di
 * copertura della query.
 */
function scoreName(name, query, year) {
  const nameTokens = tokenize(name);
  const qTokens = tokenize(query);
  if (!nameTokens.length || !qTokens.length) return 0;
  const set = new Set(nameTokens);
  let common = 0;
  for (const t of qTokens) if (set.has(t)) common++;
  if (!common) return 0;

  const containment = common / qTokens.length; // copertura della query
  const precision = common / nameTokens.length; // copertura del nome (tie-break)

  const parenYear = (String(name).match(/\((\d{4})\)/) || [])[1];
  const yearMatch = year ? parenYear === year || nameTokens.includes(year) : false;

  if (year && parenYear && parenYear !== year) return 0;

  if (yearMatch && containment >= 0.2) return 2 + containment;
  if (containment >= 0.6) return 1 + containment + 0.5 * precision;
  return 0;
}

/**
 * Sceglie l'elemento migliore: match esatto sul tmdb, con sanity-check sul
 * nome. Se il match tmdb è palesemente incoerente col titolo richiesto
 * (nessun token in comune o anno in conflitto -> scoreName 0) e il match per
 * nome trova un candidato forte (>= 1.5), preferisce il nome. I titoli
 * tradotti (es. "The Godfather" -> "Il Padrino") restano sul match tmdb
 * perché il match per nome non trova nulla.
 * Ritorna { item, via } dove via è 'tmdb' | 'name' | null.
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
 * Cerca l'entry con il tmdb richiesto. Se più entry condividono lo stesso
 * tmdb (pannelli con etichette sbagliate) e abbiamo nome+anno, sceglie quella
 * col nome più coerente con la query; altrimenti la prima in ordine di lista.
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
  // null = tentativo recente fallito: errore descrittivo, non un meta valido
  if (hit === null) {
    throw new Error(`Cinemeta non disponibile per ${id} (tentativo recente fallito)`);
  }
  if (hit !== undefined) return hit;
  let res;
  try {
    res = await fetch(`${CINEMETA_BASE}/meta/${type}/${id}.json`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    cinemetaCache.set(key, null, CINEMETA_FAIL_TTL_MS);
    throw new Error(`Cinemeta non raggiungibile: ${e.message}`);
  }
  if (!res.ok) {
    cinemetaCache.set(key, null, CINEMETA_FAIL_TTL_MS);
    throw new Error(`Cinemeta HTTP ${res.status} per ${id}`);
  }
  const data = await res.json();
  const meta = data && data.meta;
  if (!meta || typeof meta !== 'object') {
    cinemetaCache.set(key, null, CINEMETA_FAIL_TTL_MS);
    throw new Error(`Cinemeta: nessun meta per ${id}`);
  }
  cinemetaCache.set(key, meta);
  return meta;
}

/**
 * Cerca un episodio in una stagione per titolo (fallback quando il numero
 * stagione/episodio non combacia). Ritorna l'episodio o null.
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
// Risoluzione verso il catalogo IPTV
// ---------------------------------------------------------------------------

/** Match di una serie: tmdb esatto (con sanity-check), poi nome+anno. Ritorna { item, via }. */
async function matchSeries(cfg, { tmdbId, name, year }) {
  const list = await iptv.getSeries(cfg);
  return matchWithFallback(list, tmdbId, name, year);
}

/** Match di un film: tmdb esatto (con sanity-check), poi nome+anno. Ritorna { item, via }. */
async function matchMovie(cfg, { tmdbId, name, year }) {
  const list = await iptv.getVodStreams(cfg);
  return matchWithFallback(list, tmdbId, name, year);
}

/**
 * Risolve una serie esterna (tt.../tmdb...) e l'episodio richiesto.
 * Ritorna { seriesInfo, episode, seriesName } oppure null.
 * Se `trace` è un oggetto, registra ogni passo (utile per il debug).
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
      step('cinemeta', { ok: false, error: `id esterno non supportato: ${baseId}` });
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
        error: 'nessuna serie trovata sul server IPTV',
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
      via: seasonEps.some((e) => Number(e.episode_num) === episode) ? 'numero' : 'titolo',
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
 * Risolve un film esterno (tt.../tmdb...).
 * Ritorna { info, movieData, name } (struttura di get_vod_info) oppure null.
 * Se `trace` è un oggetto, registra ogni passo (utile per il debug).
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
      step('cinemeta', { ok: false, error: `id esterno non supportato: ${baseId}` });
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
        error: 'nessun film trovato sul server IPTV',
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

/** Helper per il trace: lista VOD (cacheata). */
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
