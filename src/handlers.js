'use strict';

/**
 * Addon stream handler.
 *
 * Stremio IDs handled by the stream handler:
 *   own      -> "iptv:<stream_id>"                           (movie)
 *               "iptv:<series_id>:<season>:<episode>"        (episode)
 *   external -> "tt<imdb>" / "tt<imdb>:<s>:<e>" (Cinemeta, IMDb addon)
 *               "tmdb<id>" / "tmdb<id>:<s>:<e>" (TMDB addon, Xperience)
 *
 * External IDs are resolved to the IPTV catalog via src/resolve.js (exact
 * match on the Xtream `tmdb` field, with a name+year fallback), so the addon
 * provides streams even when the content comes from other addons' catalogs.
 * Unknown ID formats return empty streams.
 */

const iptv = require('./iptv');
const format = require('./format');
const resolve = require('./resolve');
const { resolveConfig, isConfigured } = require('./config');

const HOUR = 3600;
const SOURCE_NAME = 'IPTV VOD';

// ---------------------------------------------------------------------------
// Stream construction
// ---------------------------------------------------------------------------

/** Quality from the episode video info, ignoring embedded posters/covers. */
function qualityFromVideoInfo(video) {
  if (!video || typeof video !== 'object') return undefined;
  if (video.attached_pic === 1) return undefined;
  const codec = String(video.codec_name || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'mjpeg', 'gif', 'bmp'].includes(codec)) return undefined;
  return format.qualityFromHeight(video.height);
}

async function buildMovieStreamObject(cfg, { name, info, md }) {
  const streamId = md.stream_id;
  const ext = md.container_extension || 'mp4';
  const url = iptv.movieUrl(cfg, streamId, ext);
  const displayName = String(name || info.name || md.name || '').trim();
  const { title, year } = format.splitTitleYear(displayName);

  let quality;
  try {
    const cats = await iptv.getVodCategories(cfg); // cached
    const cat = cats.find((c) => String(c.category_id) === String(md.category_id));
    if (cat) quality = format.qualityFromCategory(cat.category_name);
  } catch (e) { /* quality is optional */ }

  const sizeBytes =
    (await iptv.probeSize(url)) ||
    format.estimateSizeBytes({
      bitrateKbps: info.bitrate,
      durationSecs: info.duration_secs,
    });

  const filename = format.makeFilename({ title, year, quality, ext });
  return format.buildStream({
    name: SOURCE_NAME,
    title: displayName || filename,
    filename,
    sizeBytes,
    language: defaultLanguageFlag(cfg),
    url,
    streamFormat: cfg.streamFormat,
  });
}

/** Flag of the default language if the server does not expose one. */
function defaultLanguageFlag(cfg) {
  if (!cfg.defaultLanguage) return undefined;
  return format.languageFromCode(cfg.defaultLanguage);
}

async function buildEpisodeStreamObject(cfg, { seriesName, info, ep, season, episode }) {
  const ext = ep.container_extension || 'mp4';
  const url = iptv.episodeUrl(cfg, ep.id, ext);
  const epTitle = String(ep.title || '').trim();
  const { title: seriesTitle, year } = format.splitTitleYear(seriesName);

  const epInfo = ep.info && typeof ep.info === 'object' ? ep.info : {};
  const quality =
    qualityFromVideoInfo(epInfo.video) ||
    format.qualityFromCategory(String(epInfo.genre || ''));
  // language from the server, otherwise the configured default
  const language =
    (epInfo.audio && epInfo.audio.tags && format.languageFromCode(epInfo.audio.tags.language)) ||
    defaultLanguageFlag(cfg) ||
    undefined;

  const sizeBytes =
    (await iptv.probeSize(url)) ||
    format.estimateSizeBytes({
      bitrateKbps: epInfo.bitrate,
      durationSecs: epInfo.duration_secs,
    });

  const filename = format.makeFilename({
    title: seriesTitle,
    year,
    quality,
    episode: { season, episode },
    ext,
  });
  return format.buildStream({
    name: SOURCE_NAME,
    title: epTitle || `S${season}E${episode}`,
    filename,
    sizeBytes,
    language,
    url,
    streamFormat: cfg.streamFormat,
  });
}

// ---------------------------------------------------------------------------
// Stream
// ---------------------------------------------------------------------------

/**
 * Splits a stream ID into a handled format. Returns null for unknown IDs
 * (e.g. IDs from other addons that cannot be resolved: the request is
 * ignored).
 */
function parseStreamId(id) {
  const s = String(id || '');
  let m = /^iptv:(\d+)$/i.exec(s);
  if (m) return { own: true, kind: 'movie', streamId: m[1] };
  m = /^iptv:(\d+):(\d+):(\d+)$/i.exec(s);
  if (m) {
    return {
      own: true,
      kind: 'series',
      seriesId: m[1],
      season: Number(m[2]),
      episode: Number(m[3]),
    };
  }
  m = /^(tt\d+|tmdb\d+)(?::(\d+):(\d+))?$/i.exec(s);
  if (m) {
    return {
      own: false,
      base: m[1],
      season: m[2] !== undefined ? Number(m[2]) : undefined,
      episode: m[3] !== undefined ? Number(m[3]) : undefined,
    };
  }
  return null;
}

async function ownMovieStream(cfg, parsed) {
  const data = await iptv.getVodInfo(cfg, parsed.streamId);
  const md = (data && data.movie_data) || {};
  const info = (data && data.info) || {};
  const streamObj = await buildMovieStreamObject(cfg, {
    name: info.name || md.name,
    info,
    md,
  });
  return { streams: [streamObj], cacheMaxAge: HOUR };
}

async function ownSeriesStream(cfg, parsed) {
  const data = await iptv.getSeriesInfo(cfg, parsed.seriesId);
  const info = (data && data.info) || {};
  const episodes = data.episodes && typeof data.episodes === 'object' ? data.episodes : {};
  const seasonEps = episodes[String(parsed.season)] || episodes[parsed.season] || [];
  const ep = seasonEps.find((e) => Number(e.episode_num) === parsed.episode);
  if (!ep) return { streams: [] };
  const streamObj = await buildEpisodeStreamObject(cfg, {
    seriesName: info.name || '',
    info,
    ep,
    season: parsed.season,
    episode: parsed.episode,
  });
  return { streams: [streamObj], cacheMaxAge: HOUR };
}

async function externalMovieStream(cfg, baseId) {
  const trace = {};
  const resolved = await resolve.resolveMovie(cfg, baseId, trace);
  if (!resolved) {
    console.log(`[iptv-vod] movie ${baseId}: NOT found on the IPTV server`, JSON.stringify(trace));
    return { streams: [] };
  }
  const streamObj = await buildMovieStreamObject(cfg, {
    name: resolved.name,
    info: resolved.info,
    md: resolved.movieData,
  });
  console.log(
    `[iptv-vod] movie ${baseId}: resolved -> "${(resolved.info && resolved.info.name) || resolved.name}" url=${format.maskStreamUrl(streamObj.url)}`
  );
  return { streams: [streamObj], cacheMaxAge: HOUR };
}

async function externalSeriesStream(cfg, baseId, season, episode) {
  const trace = {};
  const resolved = await resolve.resolveSeries(cfg, baseId, season, episode, trace);
  if (!resolved) {
    console.log(
      `[iptv-vod] series ${baseId} S${season}E${episode}: NOT resolved`,
      JSON.stringify(trace)
    );
    return { streams: [] };
  }
  const streamObj = await buildEpisodeStreamObject(cfg, {
    seriesName: resolved.seriesName,
    info: resolved.seriesInfo,
    ep: resolved.episode,
    season,
    episode,
  });
  console.log(
    `[iptv-vod] series ${baseId} S${season}E${episode}: resolved -> "${resolved.seriesName}" ep="${(resolved.episode.title || '').trim()}" url=${format.maskStreamUrl(streamObj.url)}`
  );
  return { streams: [streamObj], cacheMaxAge: HOUR };
}

async function stream({ type, id, config }) {
  const cfg = resolveConfig(config);
  const t0 = Date.now();
  const idStr = String(id || '');
  console.log(
    `[iptv-vod] stream request type=${type} id=${idStr} config=${config ? 'yes' : 'no'} host=${cfg.host || '(none)'}`
  );
  if (!isConfigured(cfg)) {
    console.log(`[iptv-vod] stream ${type}/${idStr}: configuration missing -> no streams`);
    return { streams: [] };
  }
  try {
    const parsed = parseStreamId(id);
    if (!parsed) {
      console.log(`[iptv-vod] stream ${type}/${idStr}: unrecognized id -> no streams`);
      return { streams: [] };
    }
    let result;
    if (parsed.own) {
      if (type === 'movie' && parsed.kind === 'movie') {
        result = await ownMovieStream(cfg, parsed);
        console.log(
          `[iptv-vod] stream ${type}/${idStr}: own -> ${result.streams.length} stream (${Date.now() - t0}ms)`
        );
        return result;
      }
      if (type === 'series' && parsed.kind === 'series') {
        result = await ownSeriesStream(cfg, parsed);
        console.log(
          `[iptv-vod] stream ${type}/${idStr}: own -> ${result.streams.length} stream (${Date.now() - t0}ms)`
        );
        return result;
      }
      console.log(`[iptv-vod] stream ${type}/${idStr}: unhandled type -> no streams`);
      return { streams: [] };
    }
    if (type === 'movie') {
      result = await externalMovieStream(cfg, parsed.base);
      console.log(`[iptv-vod] stream ${type}/${idStr}: external -> ${result.streams.length} stream (${Date.now() - t0}ms)`);
      return result;
    }
    if (
      type === 'series' &&
      parsed.season !== undefined &&
      parsed.episode !== undefined
    ) {
      result = await externalSeriesStream(cfg, parsed.base, parsed.season, parsed.episode);
      console.log(`[iptv-vod] stream ${type}/${idStr}: external -> ${result.streams.length} stream (${Date.now() - t0}ms)`);
      return result;
    }
    console.log(`[iptv-vod] stream ${type}/${idStr}: incomplete request -> no streams`);
    return { streams: [] };
  } catch (e) {
    console.error(`[iptv-vod] stream ${type}/${idStr}: ERROR`, e.message);
    return { streams: [] };
  }
}

module.exports = { stream, parseStreamId, buildMovieStreamObject, buildEpisodeStreamObject };
