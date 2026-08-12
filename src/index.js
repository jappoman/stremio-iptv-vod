'use strict';

/**
 * Addon entry point.
 *
 * Serves:
 *   - the web configuration page at "/" and "/configure";
 *   - a /api/test endpoint to check the IPTV credentials;
 *   - the manifest with icon and the Stremio protocol endpoints (stream)
 *     via the stremio-addon-sdk router.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');

const { manifest } = require('./manifest');
const handlers = require('./handlers');
const resolve = require('./resolve');
const format = require('./format');
const { parseConfigArg } = require('./config');
const iptv = require('./iptv');

const builder = new addonBuilder(manifest);
builder.defineStreamHandler(handlers.stream);
const addonInterface = builder.getInterface();

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '64kb' }));

// ---------------------------------------------------------------------------
// Web configuration page
// ---------------------------------------------------------------------------
const landingHtml = fs.readFileSync(path.join(__dirname, 'landing.html'), 'utf8');

function renderLanding(req, res) {
  // the form starts empty: host, username and password must always be entered
  const prefill = {};
  // If the URL already carries a configuration (e.g. /<config>/configure)
  // pre-fill the form with it.
  const m = /^\/([^/]+)\/configure\/?$/.exec(req.path);
  if (m) {
    const cfg = parseConfigArg(m[1]);
    if (cfg && typeof cfg === 'object' && Object.keys(cfg).length) {
      Object.assign(prefill, cfg);
    }
  }
  const json = JSON.stringify(prefill).replace(/</g, '\\u003c');
  const html = landingHtml.replace('__PREFILL_JSON__', json);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
}

app.get('/', renderLanding);
app.get('/configure', renderLanding);
app.get(/^\/([^/]+)\/configure\/?$/, renderLanding);

// ---------------------------------------------------------------------------
// Connection test API (used by the web page)
//
// Note: accepts ONLY the credentials passed in the request, with no .env
// fallback, so the endpoint cannot act as an oracle for environment
// credentials. When exposing the addon publicly, consider a proxy/auth.
// ---------------------------------------------------------------------------
async function handleTest(req, res) {
  const body = req.body || {};
  const host = (body.host || '').toString().trim();
  const username = (body.username || '').toString().trim();
  const password = (body.password || '').toString();
  if (!host || !username || !password) {
    return res.status(400).json({ ok: false, error: 'host, username and password are required' });
  }
  try {
    const info = await iptv.testConnection({ host, username, password });
    res.json({ ok: true, ...info });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
}

app.post('/api/test', handleTest);

// ---------------------------------------------------------------------------
// Debug: full resolution trace for a stream id
// Usage: /api/debug-stream?type=series&id=tt0115341:1:1
//        /api/debug-stream?type=movie&id=tmdb11860
// Credentials can be passed explicitly (host/username/password) or are
// taken from the .env.
// ---------------------------------------------------------------------------
app.get('/api/debug-stream', async (req, res) => {
  const q = req.query || {};
  const type = String(q.type || '').trim();
  const id = String(q.id || '').trim();
  const cfg = {
    host: (q.host || '').toString().trim(),
    username: (q.username || '').toString().trim(),
    password: (q.password || '').toString(),
  };
  if (!type || !id) {
    return res.status(400).json({ ok: false, error: 'required parameters: type and id' });
  }
  if (!cfg.host || !cfg.username || !cfg.password) {
    return res.status(400).json({ ok: false, error: 'missing credentials (host, username, password)' });
  }
  const trace = { request: { type, id } };
  try {
    const parsed = handlers.parseStreamId(id);
    trace.parsed = parsed;
    if (!parsed) {
      trace.error = 'unrecognized id (unsupported format)';
      return res.json({ ok: true, trace, streams: [] });
    }
    if (parsed.own) {
      trace.path = 'own';
      if (type === 'movie' && parsed.kind === 'movie') {
        const data = await iptv.getVodInfo(cfg, parsed.streamId);
        const md = (data && data.movie_data) || {};
        const info = (data && data.info) || {};
        const streamObj = await handlers.buildMovieStreamObject(cfg, { name: info.name || md.name, info, md });
        trace.stream = {
          filename: streamObj.behaviorHints.filename,
          url: format.maskStreamUrl(streamObj.url),
          description: streamObj.description,
        };
        return res.json({ ok: true, trace, streams: [streamObj] });
      }
      if (type === 'series' && parsed.kind === 'series') {
        const data = await iptv.getSeriesInfo(cfg, parsed.seriesId);
        const info = (data && data.info) || {};
        const episodes = data.episodes && typeof data.episodes === 'object' ? data.episodes : {};
        const seasonEps = episodes[String(parsed.season)] || episodes[parsed.season] || [];
        const ep = seasonEps.find((e) => Number(e.episode_num) === parsed.episode);
        trace.episodesInSeason = seasonEps.length;
        trace.episodeFound = !!ep;
        if (!ep) {
          trace.error = `episode ${parsed.season}x${parsed.episode} not found (available seasons: ${Object.keys(episodes).map(Number).sort((a, b) => a - b).join(',')})`;
          return res.json({ ok: true, trace, streams: [] });
        }
        const streamObj = await handlers.buildEpisodeStreamObject(cfg, {
          seriesName: info.name || '', info, ep,
          season: parsed.season, episode: parsed.episode,
        });
        trace.stream = {
          filename: streamObj.behaviorHints.filename,
          url: format.maskStreamUrl(streamObj.url),
          description: streamObj.description,
        };
        return res.json({ ok: true, trace, streams: [streamObj] });
      }
      trace.error = 'unsupported type';
      return res.json({ ok: true, trace, streams: [] });
    }

    trace.path = 'external';
    if (type === 'series') {
      const resolved = await resolve.resolveSeries(cfg, parsed.base, parsed.season, parsed.episode, trace);
      if (!resolved) {
        trace.notFound = true;
        return res.json({ ok: true, trace, streams: [] });
      }
      const streamObj = await handlers.buildEpisodeStreamObject(cfg, {
        seriesName: resolved.seriesName,
        info: resolved.seriesInfo,
        ep: resolved.episode,
        season: parsed.season,
        episode: parsed.episode,
      });
      trace.stream = {
        filename: streamObj.behaviorHints.filename,
        url: format.maskStreamUrl(streamObj.url),
        description: streamObj.description,
      };
      return res.json({ ok: true, trace, streams: [streamObj] });
    }
    if (type === 'movie') {
      const resolved = await resolve.resolveMovie(cfg, parsed.base, trace);
      if (!resolved) {
        trace.notFound = true;
        return res.json({ ok: true, trace, streams: [] });
      }
      const streamObj = await handlers.buildMovieStreamObject(cfg, {
        name: resolved.name, info: resolved.info, md: resolved.movieData,
      });
      trace.stream = {
        filename: streamObj.behaviorHints.filename,
        url: format.maskStreamUrl(streamObj.url),
        description: streamObj.description,
      };
      return res.json({ ok: true, trace, streams: [streamObj] });
    }
    trace.error = 'unsupported type';
    return res.json({ ok: true, trace, streams: [] });
  } catch (e) {
    trace.error = e.message;
    console.error('[iptv-vod] debug-stream:', e.message);
    return res.json({ ok: false, trace, streams: [] });
  }
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------------------
// Manifest with absolute logo/icon (the host depends on the installation) and
// removal of behaviorHints.configurable when the URL already carries the
// config (same behavior as the SDK router, but with the icon injected).
// ---------------------------------------------------------------------------
const manifestJson = JSON.stringify(manifest);
app.get(/^\/(?:([^/]*)\/)?manifest\.json$/, (req, res) => {
  const m = req.path.match(/^\/(?:([^/]*)\/)?manifest\.json$/);
  const hasConfig = !!(m && m[1]);
  const base = `${req.protocol}://${req.get('host')}`;
  const iconUrl = `${base}/public/icon.png`;
  const clone = JSON.parse(manifestJson);
  clone.logo = iconUrl;
  clone.icon = iconUrl;
  clone.favicon = iconUrl;
  if (hasConfig && clone.behaviorHints) {
    delete clone.behaviorHints.configurationRequired;
    delete clone.behaviorHints.configurable;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(JSON.stringify(clone));
});

// ---------------------------------------------------------------------------
// Stremio protocol router (stream)
// ---------------------------------------------------------------------------
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use(getRouter(addonInterface));

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '7000', 10);

app.listen(PORT, () => {
  console.log(`📺 IPTV VOD addon listening on http://127.0.0.1:${PORT}/manifest.json`);
  console.log(`⚙️  Configuration page: http://127.0.0.1:${PORT}/`);
});
