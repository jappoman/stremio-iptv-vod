'use strict';

/**
 * Costruzione dei campi stream nel formato atteso da AIOStreams.
 *
 * AIOStreams (StreamParser) ricava da ogni stream:
 *   - filename: da `behaviorHints.filename`, altrimenti dalla prima riga
 *     utile della `description` (riga con anno/stagione/episodio), che poi
 *     viene parsata con il suo FileParser (parse-torrent-title);
 *   - dimensione: da `behaviorHints.videoSize` (numero di byte) oppure da un
 *     valore `X GB/MB` presente nella description (fuori dalla riga filename);
 *   - lingue: dalle emoji bandiera (es. 🇮🇹) presenti in description/name;
 *   - tipo stream: 'http' se l'url non termina in .m3u8.
 *
 * Quindi la `description` segue il formato:
 *   <filename con anno/qualità>
 *   📦 <dimensione>
 *   <bandiera> <lingua>
 */

const QUALITY_HINTS = [
  { re: /4k|uhd|2160p/i, label: '2160p' },
  { re: /fhd|1080p/i, label: '1080p' },
  { re: /720p/i, label: '720p' },
  { re: /3d/i, label: '3D' },
];

// Codici lingua -> emoji bandiera + nome in inglese (AIOStreams usa
// l'inglese per il display name e le bandiere per l'identificazione).
const LANGUAGE_MAP = {  ita: ['🇮🇹', 'Italian'],
  it: ['🇮🇹', 'Italian'],
  eng: ['🇬🇧', 'English'],
  en: ['🇬🇧', 'English'],
  fre: ['🇫🇷', 'French'],
  fra: ['🇫🇷', 'French'],
  fr: ['🇫🇷', 'French'],
  deu: ['🇩🇪', 'German'],
  ger: ['🇩🇪', 'German'],
  de: ['🇩🇪', 'German'],
  spa: ['🇪🇸', 'Spanish'],
  es: ['🇪🇸', 'Spanish'],
  por: ['🇵🇹', 'Portuguese'],
  pt: ['🇵🇹', 'Portuguese'],
  ara: ['🇸🇦', 'Arabic'],
  tur: ['🇹🇷', 'Turkish'],
  tr: ['🇹🇷', 'Turkish'],
  rus: ['🇷🇺', 'Russian'],
  ru: ['🇷🇺', 'Russian'],
  pol: ['🇵🇱', 'Polish'],
  pl: ['🇵🇱', 'Polish'],
  nld: ['🇳🇱', 'Dutch'],
  nl: ['🇳🇱', 'Dutch'],
  hun: ['🇭🇺', 'Hungarian'],
  hu: ['🇭🇺', 'Hungarian'],
  ces: ['🇨🇿', 'Czech'],
  cs: ['🇨🇿', 'Czech'],
  swe: ['🇸🇪', 'Swedish'],
  sv: ['🇸🇪', 'Swedish'],
  nor: ['🇳🇴', 'Norwegian'],
  no: ['🇳🇴', 'Norwegian'],
  dan: ['🇩🇰', 'Danish'],
  da: ['🇩🇰', 'Danish'],
  fin: ['🇫🇮', 'Finnish'],
  fi: ['🇫🇮', 'Finnish'],
  ell: ['🇬🇷', 'Greek'],
  el: ['🇬🇷', 'Greek'],
  heb: ['🇮🇱', 'Hebrew'],
  he: ['🇮🇱', 'Hebrew'],
  hin: ['🇮🇳', 'Hindi'],
  hi: ['🇮🇳', 'Hindi'],
  tha: ['🇹🇭', 'Thai'],
  th: ['🇹🇭', 'Thai'],
  zho: ['🇨🇳', 'Chinese'],
  zh: ['🇨🇳', 'Chinese'],
  jpn: ['🇯🇵', 'Japanese'],
  ja: ['🇯🇵', 'Japanese'],
  kor: ['🇰🇷', 'Korean'],
  ko: ['🇰🇷', 'Korean'],
  ukr: ['🇺🇦', 'Ukrainian'],
  uk: ['🇺🇦', 'Ukrainian'],
  rom: ['🇷🇴', 'Romanian'],
  ro: ['🇷🇴', 'Romanian'],
  bul: ['🇧🇬', 'Bulgarian'],
  bg: ['🇧🇬', 'Bulgarian'],
  hrv: ['🇭🇷', 'Croatian'],
  hr: ['🇭🇷', 'Croatian'],
  srp: ['🇷🇸', 'Serbian'],
  sr: ['🇷🇸', 'Serbian'],
};

/**
 * Divide "Titolo (2020)" in { title: "Titolo", year: "2020" }.
 * Gestisce anche titoli che contengono l'anno al centro (es. "Mission
 * Impossible 7 (2023)") e titoli senza anno.
 */
function splitTitleYear(name) {
  const raw = String(name || '').trim();
  if (!raw) return { title: '', year: undefined };
  const match = raw.match(/^(.*?)[\s_]*\((\d{4})\)[\s_]*$/);
  if (match) {
    return { title: match[1].trim(), year: match[2] };
  }
  const anyYear = raw.match(/\((\d{4})\)/);
  return {
    title: raw.replace(/\s*\(\d{4}\)\s*/g, ' ').trim(),
    year: anyYear ? anyYear[1] : undefined,
  };
}

/** Rimuove i caratteri non ammessi nei nomi file. */
function sanitizeTitle(title) {
  return String(title || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Estrae la qualità (2160p/1080p/720p/3D) dal nome di una categoria. */
function qualityFromCategory(categoryName) {
  const name = String(categoryName || '');
  for (const hint of QUALITY_HINTS) {
    if (hint.re.test(name)) return hint.label;
  }
  return undefined;
}

/** Estrae la qualità dalla risoluzione video (altezza in pixel). */
function qualityFromHeight(height) {
  const h = Number(height);
  if (!Number.isFinite(h) || h <= 0) return undefined;
  if (h >= 2000) return '2160p';
  if (h >= 1000) return '1080p';
  if (h >= 700) return '720p';
  if (h >= 480) return '480p';
  return undefined; // sotto 480p nessuna etichetta (SD non è una qualità parsabile)
}

/** Mappa un codice lingua (tag audio ffmpeg, es. "ita") a "🇮🇹 Italian". */
function languageFromCode(code) {
  const entry = LANGUAGE_MAP[String(code || '').toLowerCase()];
  return entry ? `${entry[0]} ${entry[1]}` : undefined;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Costruisce un filename parsabile da parse-torrent-title:
 *   "Dolemite Is My Name (2019).1080p.mp4"
 *   "Destination X (2025).S01E01.1080p.mp4"
 */
function makeFilename({ title, year, quality, episode, ext }) {
  let filename = sanitizeTitle(title);
  if (!filename) filename = 'Video';
  if (year) filename += ` (${year})`;
  if (episode && episode.season !== undefined && episode.episode !== undefined) {
    filename += `.S${pad2(episode.season)}E${pad2(episode.episode)}`;
  }
  if (quality) filename += `.${quality}`;
  return `${filename}.${ext || 'mp4'}`;
}

/** Formatta i byte in "2.4 GB" / "850 MB" (unità binarie, come AIOStreams). */
function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unit]}`;
}

/**
 * Stima la dimensione in byte da bitrate (kbps) e durata (secondi).
 * È la stessa formula usata dai player IPTV quando il server non espone
 * la dimensione.
 */
function estimateSizeBytes({ bitrateKbps, durationSecs }) {
  const bitrate = Number(bitrateKbps);
  const duration = Number(durationSecs);
  if (!(bitrate > 0) || !(duration > 0)) return undefined;
  return Math.round((bitrate * 1000) / 8 * duration);
}

/**
 * Costruisce la `description` nel formato AIOStreams:
 *   <filename>
 *   📦 <dimensione>
 *   <bandiera> <lingua>
 */
function buildDescription({ filename, sizeBytes, language }) {
  const lines = [filename];
  const size = formatBytes(sizeBytes);
  if (size) lines.push(`📦 ${size}`);
  if (language) lines.push(language);
  return lines.join('\n');
}

/**
 * Marker "cached" per AIOStreams.
 *
 * AIOStreams valorizza `service.cached` SOLO se il campo `name` dello stream
 * contiene un service conosciuto (es. RD) seguito da un simbolo cached
 * (⚡/🚀/cached/🌩️/📫) o da `+` — vedi `parseServiceData` in
 * packages/core/src/parser/streams.ts. Per un addon non-debrid non esiste
 * altro modo di segnalare "cached".
 *
 * I VOD IPTV sono direct download: se l'addon li trova, sono già pronti da
 * riprodurre (stessa semantica di un file cached su debrid). Senza il marker,
 * AIOStreams lascia `service.cached` indefinito e i formatter più comuni
 * rendono la X rossa ("uncached") sulle nostre fonti.
 *
 * Nota: il marker fa classificare lo stream come tipo `debrid` da AIOStreams
 * (è l'effetto collaterale del meccanismo) e può mostrare "RD" come servizio.
 */
const AIO_CACHED_MARKER = ' ⚡ RD';

/**
 * Costruisce l'oggetto stream Stremio completo.
 * `streamFormat`:
 *   - 'aio' (default): description con filename/📦/bandiere + behaviorHints
 *     filename/videoSize, come richiesto da AIOStreams (title mantenuto per
 *     i client più vecchi, come fa streamvix); il `name` include il marker
 *     cached per AIOStreams;
 *   - 'normal': stream Stremio essenziale (name/title/url), senza campi AIO,
 *     per i client che vogliono solo il formato classico.
 */
function buildStream({ name, title, filename, sizeBytes, language, url, streamFormat }) {
  if (streamFormat === 'normal') {
    return { name: name || 'IPTV VOD', title: title || filename, url };
  }
  const stream = {
    name: (name || 'IPTV VOD') + AIO_CACHED_MARKER,
    title: title || filename,
    description: buildDescription({ filename, sizeBytes, language }),
    url,
    behaviorHints: { filename },
  };
  if (Number.isFinite(Number(sizeBytes)) && Number(sizeBytes) > 0) {
    stream.behaviorHints.videoSize = Number(sizeBytes);
  }
  return stream;
}

/** Maschera le credenziali in un URL di stream per i log (es. host/movie/user/pass/id.ext -> host/movie/[masked]/[masked]/id.ext). */
function maskStreamUrl(url) {
  return String(url || '').replace(
    /(\/movie\/|\/series\/)[^/]+\/[^/]+\//,
    '$1[masked]/[masked]/'
  );
}

module.exports = {
  splitTitleYear,
  sanitizeTitle,
  qualityFromCategory,
  qualityFromHeight,
  languageFromCode,
  makeFilename,
  formatBytes,
  estimateSizeBytes,
  buildDescription,
  buildStream,
  maskStreamUrl,
};
