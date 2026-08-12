'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
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
} = require('../src/format');

test('splitTitleYear: year at the end', () => {
  assert.deepEqual(splitTitleYear('Dolemite Is My Name (2019)'), {
    title: 'Dolemite Is My Name',
    year: '2019',
  });
});

test('splitTitleYear: without year', () => {
  assert.deepEqual(splitTitleYear('Un Titolo Qualunque'), {
    title: 'Un Titolo Qualunque',
    year: undefined,
  });
});

test('splitTitleYear: empty', () => {
  assert.deepEqual(splitTitleYear(''), { title: '', year: undefined });
});

test('splitTitleYear: title with year in the middle', () => {
  const r = splitTitleYear('Mission Impossible 7 (2023)');
  assert.equal(r.title, 'Mission Impossible 7');
  assert.equal(r.year, '2023');
});

test('makeFilename: movie with quality', () => {
  assert.equal(
    makeFilename({ title: 'Dolemite Is My Name', year: '2019', quality: '1080p', ext: 'mp4' }),
    'Dolemite Is My Name (2019).1080p.mp4'
  );
});

test('makeFilename: episode with SxxEyy', () => {
  assert.equal(
    makeFilename({ title: 'Destination X', year: '2025', episode: { season: 1, episode: 1 }, ext: 'mp4' }),
    'Destination X (2025).S01E01.mp4'
  );
});

test('makeFilename: episode with quality and numbers > 9', () => {
  assert.equal(
    makeFilename({ title: 'La Serie', year: '2020', quality: '1080p', episode: { season: 12, episode: 3 }, ext: 'mkv' }),
    'La Serie (2020).S12E03.1080p.mkv'
  );
});

test('makeFilename: sanitizes forbidden characters', () => {
  const f = makeFilename({ title: 'Film: Strano? (2020)', year: '2020', ext: 'mp4' });
  assert.ok(!/[\\/:*?"<>|]/.test(f), f);
  assert.ok(f.startsWith('Film Strano'));
});

test('qualityFromCategory: recognizes qualities', () => {
  assert.equal(qualityFromCategory('◈ Film 4k UHD ◈'), '2160p');
  assert.equal(qualityFromCategory('◈ Film FHD 1080p ◈'), '1080p');
  assert.equal(qualityFromCategory('◈ Film HD 720p ◈'), '720p');
  assert.equal(qualityFromCategory('◈ Film 3D ◈'), '3D');
  assert.equal(qualityFromCategory('◈ Film Netflix ◈'), undefined);
});

test('qualityFromHeight: resolutions', () => {
  assert.equal(qualityFromHeight(2160), '2160p');
  assert.equal(qualityFromHeight(1080), '1080p');
  assert.equal(qualityFromHeight(720), '720p');
  assert.equal(qualityFromHeight(480), '480p');
  assert.equal(qualityFromHeight(384), undefined); // SD not labeled
  assert.equal(qualityFromHeight(undefined), undefined);
  assert.equal(qualityFromHeight(0), undefined);
});

test('languageFromCode: maps ffmpeg tags', () => {
  assert.equal(languageFromCode('ita'), '🇮🇹 Italian');
  assert.equal(languageFromCode('ITA'), '🇮🇹 Italian');
  assert.equal(languageFromCode('eng'), '🇬🇧 English');
  assert.equal(languageFromCode('xyz'), undefined);
  assert.equal(languageFromCode(undefined), undefined);
});

test('formatBytes: binary units', () => {
  assert.equal(formatBytes(1024), '1.00 KB');
  assert.equal(formatBytes(2.4 * 1024 * 1024 * 1024), '2.40 GB');
  assert.equal(formatBytes(0), undefined);
  assert.equal(formatBytes(-5), undefined);
});

test('estimateSizeBytes: bitrate x duration', () => {
  // 2561 kbps * 1000 / 8 * 2926 s
  const expected = Math.round((2561 * 1000) / 8 * 2926);
  assert.equal(estimateSizeBytes({ bitrateKbps: 2561, durationSecs: 2926 }), expected);
  assert.equal(estimateSizeBytes({ bitrateKbps: 0, durationSecs: 100 }), undefined);
  assert.equal(estimateSizeBytes({ bitrateKbps: 100, durationSecs: undefined }), undefined);
});

test('buildDescription: AIOStreams format', () => {
  const d = buildDescription({
    filename: 'Film (2020).1080p.mp4',
    sizeBytes: 2.4 * 1024 * 1024 * 1024,
    language: '🇮🇹 Italian',
  });
  const lines = d.split('\n');
  assert.equal(lines[0], 'Film (2020).1080p.mp4');
  assert.match(lines[1], /^📦 2\.40 GB$/);
  assert.equal(lines[2], '🇮🇹 Italian');
});

test('buildDescription: without size and language', () => {
  const d = buildDescription({ filename: 'Film (2020).mp4' });
  assert.equal(d, 'Film (2020).mp4');
});

test('buildStream: full fields + behaviorHints', () => {
  const s = buildStream({
    name: 'IPTV VOD',
    title: 'Film (2020)',
    filename: 'Film (2020).1080p.mp4',
    sizeBytes: 1000,
    language: '🇮🇹 Italian',
    url: 'http://srv/movie/u/p/1.mp4',
  });
  assert.equal(s.name, 'IPTV VOD'); // no marker: the source stays type http for AIOStreams
  assert.equal(s.title, 'Film (2020)');
  assert.equal(s.behaviorHints.filename, 'Film (2020).1080p.mp4');
  assert.equal(s.behaviorHints.videoSize, 1000);
  assert.ok(s.description.startsWith('Film (2020).1080p.mp4'));
});

// Replica of the AIOStreams gate (parseServiceData in
// packages/core/src/parser/streams.ts): a name without a marker must never
// match a service (otherwise AIOStreams would classify the http source
// as debrid, ranking it in the cached group). The "http = always
// available" handling belongs in the AIOStreams formatter via stream.type.
test('AIOStreams: a clean name does NOT match any service', () => {
  const SERVICES = ['RD', 'Real Debrid', 'RealDebrid', 'Real-Debrid', 'AD', 'AllDebrid', 'PM', 'Premiumize', 'TorBox', 'StremThru', 'MediaFlow'];
  const regex = new RegExp(
    `(^|(?<![^ |[(_\\/\\-.]))(${SERVICES.join('|')})(?=[ ⬇️⏳⚡☁️🌩️📫+/|\\)\\]_.-]|$|\n)`,
    'im'
  );
  assert.equal(regex.test('IPTV VOD'), false, 'the name must not contain service names');
  assert.equal(regex.test('IPTV VOD ⚡'), false, 'cached symbols alone are not enough (nor needed)');
});

test('buildStream: without size does not set videoSize', () => {
  const s = buildStream({ filename: 'F.mp4', url: 'http://x' });
  assert.equal(s.behaviorHints.videoSize, undefined);
});

test('buildStream: normal format = only name/title/url', () => {
  const s = buildStream({
    name: 'IPTV VOD',
    title: 'Film (2020)',
    filename: 'Film (2020).1080p.mp4',
    sizeBytes: 1000,
    language: '🇮🇹 Italian',
    url: 'http://srv/movie/u/p/1.mp4',
    streamFormat: 'normal',
  });
  assert.deepEqual(Object.keys(s).sort(), ['name', 'title', 'url']);
  assert.equal(s.name, 'IPTV VOD');
  assert.equal(s.title, 'Film (2020)');
  assert.equal(s.url, 'http://srv/movie/u/p/1.mp4');
});

test('maskStreamUrl: masks username and password', () => {
  assert.equal(
    maskStreamUrl('http://server/movie/myuser/mypassword/123.mp4'),
    'http://server/movie/[masked]/[masked]/123.mp4'
  );
  assert.equal(
    maskStreamUrl('http://server/series/u/p/456.mkv'),
    'http://server/series/[masked]/[masked]/456.mkv'
  );
  assert.equal(maskStreamUrl('http://server/video/altro.mp4'), 'http://server/video/altro.mp4');
});
