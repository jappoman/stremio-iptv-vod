'use strict';

/**
 * Addon configuration resolution.
 *
 * The configuration ALWAYS comes from the addon URL (URL-encoded JSON in the
 * path, handled by the stremio-addon-sdk router and passed to the handlers).
 * Host, username and password are required: without them the addon returns no
 * streams (no fallback on files or environment variables).
 */

function str(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

/**
 * Effective addon configuration.
 * `cfg` is the config object passed by the stremio-addon-sdk handlers
 * (values may be strings, e.g. select inputs).
 */
function resolveConfig(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const host = str(c.host);
  const username = str(c.username);
  const password = str(c.password);
  // 'aio' (default) or 'normal'
  const streamFormatRaw = (c.streamFormat || 'aio').toString().trim().toLowerCase();
  const streamFormat = streamFormatRaw === 'normal' ? 'normal' : 'aio';
  // default language used when the server does not expose the audio language ('none' = no flag)
  const defaultLanguageRaw = (c.defaultLanguage || 'ita').toString().trim().toLowerCase();
  const defaultLanguage = defaultLanguageRaw && defaultLanguageRaw !== 'none' ? defaultLanguageRaw : undefined;
  return { host, username, password, streamFormat, defaultLanguage };
}

/** True when host, username and password are all present (all required). */
function isConfigured(cfg) {
  return !!(cfg.host && cfg.username && cfg.password);
}

/**
 * Permissive parser for the configuration passed in the URL (used to
 * pre-fill the web configuration page). Supports plain JSON, URL-encoded
 * JSON and Base64, like streamvix does.
 */
function parseConfigArg(arg) {
  if (!arg || arg === 'undefined' || arg === 'null') return {};
  if (typeof arg === 'object') return arg;

  let decoded = arg;
  try {
    const parsed = JSON.parse(arg);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (e) { /* not plain JSON */ }

  try {
    decoded = decodeURIComponent(arg);
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (e) { /* not URL-encoded JSON */ }

  try {
    const base64 = decoded.replace(/%3D/g, '=');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (e) { /* not base64 */ }

  return {};
}

module.exports = { resolveConfig, isConfigured, parseConfigArg, str };
