'use strict';

/**
 * Builds the stream fields in the format expected by AIOStreams.
 *
 * AIOStreams (StreamParser) derives from each stream:
 *   - filename: from `behaviorHints.filename`, otherwise from the first
 *     useful line of the `description` (a line with year/season/episode),
 *     which is then parsed with its FileParser (parse-torrent-title);
 *   - size: from `behaviorHints.videoSize` (bytes) or a `X GB/MB` value in
 *     the description (outside the filename line);
 *   - languages: from the flag emojis (e.g. 🇮🇹) in description/name;
 *   - stream type: 'http' when the url does not end in .m3u8.
 *
 * So the `description` follows the format:
 *   <filename with year/quality>
 *   📦 <size>
 *   <flag> <language>
 */

const QUALITY_HINTS = [
  { re: /4k|uhd|2160p/i, label: '2160p' },
  { re: /fhd|1080p/i, label: '1080p' },
  { re: /720p/i, label: '720p' },
  { re: /3d/i, label: '3D' },
];

// Language codes -> flag emoji + English name (AIOStreams uses English for
// display names and flags for identification).
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
 * Splits "Title (2020)" into { title: "Title", year: "2020" }.
 * Also handles titles with the year in the middle (e.g. "Mission
 * Impossible 7 (2023)") and titles without a year.
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

/** Removes characters not allowed in file names. */
function sanitizeTitle(title) {
  return String(title || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extracts the quality (2160p/1080p/720p/3D) from a category name. */
function qualityFromCategory(categoryName) {
  const name = String(categoryName || '');
  for (const hint of QUALITY_HINTS) {
    if (hint.re.test(name)) return hint.label;
  }
  return undefined;
}

/** Extracts the quality from the video resolution (height in pixels). */
function qualityFromHeight(height) {
  const h = Number(height);
  if (!Number.isFinite(h) || h <= 0) return undefined;
  if (h >= 2000) return '2160p';
  if (h >= 1000) return '1080p';
  if (h >= 700) return '720p';
  if (h >= 480) return '480p';
  return undefined; // below 480p no label (SD is not a parseable quality)
}

/** Maps a language code (ffmpeg audio tag, e.g. "ita") to "🇮🇹 Italian". */
function languageFromCode(code) {
  const entry = LANGUAGE_MAP[String(code || '').toLowerCase()];
  return entry ? `${entry[0]} ${entry[1]}` : undefined;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Builds a filename parseable by parse-torrent-title:
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

/** Formats bytes as "2.4 GB" / "850 MB" (binary units, like AIOStreams). */
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
 * Estimates the size in bytes from bitrate (kbps) and duration (seconds).
 * Same formula used by IPTV players when the server does not expose the
 * size.
 */
function estimateSizeBytes({ bitrateKbps, durationSecs }) {
  const bitrate = Number(bitrateKbps);
  const duration = Number(durationSecs);
  if (!(bitrate > 0) || !(duration > 0)) return undefined;
  return Math.round((bitrate * 1000) / 8 * duration);
}

/**
 * Builds the `description` in the AIOStreams format:
 *   <filename>
 *   📦 <size>
 *   <flag> <language>
 */
function buildDescription({ filename, sizeBytes, language }) {
  const lines = [filename];
  const size = formatBytes(sizeBytes);
  if (size) lines.push(`📦 ${size}`);
  if (language) lines.push(language);
  return lines.join('\n');
}

/**
 * Builds the complete Stremio stream object.
 * `streamFormat`:
 *   - 'aio' (default): description with filename/📦/flags + behaviorHints
 *     filename/videoSize, as required by AIOStreams (title kept for older
 *     clients, like streamvix does);
 *   - 'normal': minimal Stremio stream (name/title/url), without AIO fields,
 *     for clients that want the classic format only.
 *
 * Note: we deliberately do NOT add "cached" markers to the `name` (e.g. "RD ⚡").
 * AIOStreams uses that mechanism for debrid addons only; marking an http
 * source as debrid/cached would rank it at the top of the cached group,
 * above torrents with seeders. The correct handling of http sources (always
 * available = ⚡ in the formatter, ranked between "torrents with sources"
 * and "torrents with zero sources") belongs in the AIOStreams formatter via
 * `stream.type` and ranked stream expressions.
 */
function buildStream({ name, title, filename, sizeBytes, language, url, streamFormat }) {
  if (streamFormat === 'normal') {
    return { name: name || 'IPTV VOD', title: title || filename, url };
  }
  const stream = {
    name: name || 'IPTV VOD',
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

/** Masks credentials in a stream URL for logs (e.g. host/movie/user/pass/id.ext -> host/movie/[masked]/[masked]/id.ext). */
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
