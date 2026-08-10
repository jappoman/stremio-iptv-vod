'use strict';

/**
 * Risoluzione della configurazione dell'addon.
 *
 * La configurazione arriva SEMPRE dall'URL dell'addon (JSON URL-encoded nel
 * path, gestito dal router dello stremio-addon-sdk e consegnato agli handler).
 * Host, username e password sono obbligatori: senza di essi l'addon non
 * restituisce stream (niente fallback su file o variabili d'ambiente).
 */

function str(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

/**
 * Configurazione effettiva dell'addon.
 * `cfg` è l'oggetto config passato dagli handler dello stremio-addon-sdk
 * (i valori possono essere stringhe, es. select).
 */
function resolveConfig(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const host = str(c.host);
  const username = str(c.username);
  const password = str(c.password);
  // 'aio' (default) o 'normal'
  const streamFormatRaw = (c.streamFormat || 'aio').toString().trim().toLowerCase();
  const streamFormat = streamFormatRaw === 'normal' ? 'normal' : 'aio';
  // lingua di default quando il server non espone quella audio ('none' = nessuna)
  const defaultLanguageRaw = (c.defaultLanguage || 'ita').toString().trim().toLowerCase();
  const defaultLanguage = defaultLanguageRaw && defaultLanguageRaw !== 'none' ? defaultLanguageRaw : undefined;
  return { host, username, password, streamFormat, defaultLanguage };
}

/** True quando host, username e password sono presenti (tutti obbligatori). */
function isConfigured(cfg) {
  return !!(cfg.host && cfg.username && cfg.password);
}

/**
 * Parser permissivo della configurazione passata nell'URL (usato per
 * precompilare la pagina web di configurazione). Supporta JSON diretto,
 * URL-encoded e Base64, come fa streamvix.
 */
function parseConfigArg(arg) {
  if (!arg || arg === 'undefined' || arg === 'null') return {};
  if (typeof arg === 'object') return arg;

  let decoded = arg;
  try {
    const parsed = JSON.parse(arg);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (e) { /* non è JSON diretto */ }

  try {
    decoded = decodeURIComponent(arg);
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (e) { /* non è URL-encoded JSON */ }

  try {
    const base64 = decoded.replace(/%3D/g, '=');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (e) { /* non è base64 */ }

  return {};
}

module.exports = { resolveConfig, isConfigured, parseConfigArg, str };
