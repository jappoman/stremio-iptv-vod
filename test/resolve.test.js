'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  scoreName,
  normalize,
  tokenize,
  matchEpisodeByTitle,
  fetchCinemetaMeta,
  matchWithFallback,
} = require('../src/resolve');
const { parseStreamId } = require('../src/handlers');

// ---------------------------------------------------------------------------
// scoreName
// ---------------------------------------------------------------------------

test('scoreName: anno nel nome + token comune -> match', () => {
  const score = scoreName('Sabrina, vita da strega (1996)', 'Sabrina the Teenage Witch', '1996');
  assert.ok(score > 0, `score=${score}`);
});

test('scoreName: stesso token ma anno diverso -> nessun match', () => {
  assert.equal(
    scoreName('Ciao, Sabrina (1989)', 'Sabrina the Teenage Witch', '1996'),
    0
  );
});

test('scoreName: conflitto di anno -> nessun match (Godfather 1972 vs Part II 1974)', () => {
  assert.equal(scoreName('The Godfather Part II (1974)', 'The Godfather', '1972'), 0);
});

test('scoreName: conflitto di anno (Terminator 1984 vs T2 1991)', () => {
  assert.equal(scoreName('Terminator 2: Judgment Day (1991)', 'Terminator', '1984'), 0);
});

test('scoreName: anno tra parentesi vince sul primo token numerico (1917)', () => {
  assert.ok(scoreName('1917 (2019)', '1917', '2019') > 0);
});

test('scoreName: nessun anno, ratio basso -> nessun match', () => {
  assert.equal(
    scoreName('Le terrificanti avventure di Sabrina', 'Sabrina the Teenage Witch', '1996'),
    0
  );
});

test('scoreName: match forte senza anno', () => {
  assert.ok(scoreName('The Matrix (1999)', 'Matrix', undefined) > 0);
});

test('scoreName: match con anno e query corta', () => {
  assert.ok(scoreName('Sabrina (1995)', 'Sabrina', '1995') > 0);
});

test('scoreName: nomi completamente diversi -> 0', () => {
  assert.equal(scoreName('Dune - Parte Due (2024)', 'The Matrix', '1999'), 0);
});

test('scoreName: preferisce il titolo esatto su spin-off a parità di copertura (Dragon Ball)', () => {
  const base = scoreName('Dragon Ball', 'Dragon Ball', '1995');
  const kai = scoreName('Dragon Ball Kai', 'Dragon Ball', '1995');
  const z = scoreName('Dragon Ball Z (1989)', 'Dragon Ball', '1995');
  const heroes = scoreName('Super Dragon Ball Heroes', 'Dragon Ball', '1995');
  assert.ok(base > 0, `base=${base}`);
  assert.ok(base > kai, `base ${base} deve battere kai ${kai}`);
  assert.equal(z, 0, 'anno in conflitto -> 0');
  assert.ok(base > heroes, `base ${base} deve battere heroes ${heroes}`);
});

test('scoreName: query lunga vs nome corto senza anno (The Hobbit)', () => {
  assert.ok(scoreName('The Hobbit (2012)', 'The Hobbit: An Unexpected Journey', '2012') > 0);
});

test('matchWithFallback: senza tmdb -> match per nome sceglie la serie base', () => {
  const list = [
    { series_id: 5334, name: 'Dragon Ball Kai', tmdb: '61709' },
    { series_id: 393, name: 'Dragon Ball', tmdb: '12609' },
  ];
  const r = matchWithFallback(list, '217282', 'Dragon Ball', '1995');
  assert.equal(r.via, 'name');
  assert.equal(r.item.series_id, 393);
});

test('matchWithFallback: tmdb valido vince', () => {
  const list = [
    { series_id: 5334, name: 'Dragon Ball Kai', tmdb: '61709' },
    { series_id: 393, name: 'Dragon Ball', tmdb: '12609' },
  ];
  const r = matchWithFallback(list, '12609', 'Dragon Ball', '1986');
  assert.equal(r.via, 'tmdb');
  assert.equal(r.item.series_id, 393);
});

test('matchWithFallback: tmdb condiviso tra più entry -> disambigua per nome', () => {
  // pannello IPTV che etichetta Kai e la serie base con lo stesso tmdb
  const list = [
    { series_id: 5334, name: 'Dragon Ball Kai', tmdb: '12609' },
    { series_id: 393, name: 'Dragon Ball', tmdb: '12609' },
  ];
  const r = matchWithFallback(list, '12609', 'Dragon Ball', '1986');
  assert.equal(r.item.series_id, 393, 'deve scegliere la serie base, non Kai');
});

test('matchWithFallback: titolo tradotto (The Godfather -> Il Padrino) resta sul tmdb', () => {
  const list = [{ series_id: 1, name: 'Il Padrino (1972)', tmdb: '240' }];
  const r = matchWithFallback(list, '240', 'The Godfather', '1972');
  assert.equal(r.via, 'tmdb');
  assert.equal(r.item.series_id, 1);
});

test('matchWithFallback: nessun candidato -> null', () => {
  assert.equal(matchWithFallback([], '99999', 'Titolo Inesistente', '2000'), null);
});

test('normalize/tokenize: accentate e punteggiatura', () => {
  assert.equal(normalize('  Sabrina, vita da strega (1996)! '), 'sabrina vita da strega 1996');
  assert.deepEqual(tokenize('Dune - Parte Due (2024)'), ['dune', 'parte', 'due', '2024']);
});

// ---------------------------------------------------------------------------
// matchEpisodeByTitle
// ---------------------------------------------------------------------------

test('matchEpisodeByTitle: match per titolo', () => {
  const eps = [
    { episode_num: 1, title: 'Pilot' },
    { episode_num: 2, title: 'Bewitched, Bothered and Bewildered' },
  ];
  assert.equal(matchEpisodeByTitle(eps, 'Bewitched Bothered').episode_num, 2);
  assert.equal(matchEpisodeByTitle(eps, 'bEwItChEd bOtHeReD').episode_num, 2);
});

test('matchEpisodeByTitle: non aggancia episodi senza titolo', () => {
  const eps = [{ episode_num: 1, title: '' }, { episode_num: 2, title: 'Il Ballo' }];
  assert.equal(matchEpisodeByTitle(eps, 'Il Ballo').episode_num, 2);
  assert.equal(matchEpisodeByTitle(eps, 'Qualcosa di inesistente'), null);
});

test('matchEpisodeByTitle: titolo vuoto -> null', () => {
  assert.equal(matchEpisodeByTitle([{ episode_num: 1, title: 'X' }], ''), null);
  assert.equal(matchEpisodeByTitle([{ episode_num: 1, title: 'X' }], undefined), null);
});

// ---------------------------------------------------------------------------
// fetchCinemetaMeta (fetch stubbato)
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = originalFetch;
});

test('fetchCinemetaMeta: successo -> cache (un solo fetch)', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => ({ meta: { name: 'Sabrina the Teenage Witch', moviedb_id: '605' } }),
    };
  };
  const m1 = await fetchCinemetaMeta('series', 'tt-uniquetest1');
  const m2 = await fetchCinemetaMeta('series', 'tt-uniquetest1');
  assert.equal(m1.moviedb_id, '605');
  assert.equal(m2, m1);
  assert.equal(calls, 1);
});

test('fetchCinemetaMeta: fallimento -> errore e failure cache (nessun secondo fetch)', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return { ok: false, status: 404 };
  };
  await assert.rejects(fetchCinemetaMeta('series', 'tt-uniquetest2'), /Cinemeta HTTP 404/);
  await assert.rejects(fetchCinemetaMeta('series', 'tt-uniquetest2'), /tentativo recente fallito/);
  assert.equal(calls, 1, 'la failure cache deve evitare un secondo fetch');
});

test('fetchCinemetaMeta: rete giù -> errore leggibile', async () => {
  global.fetch = async () => {
    const e = new Error('ENOTFOUND');
    e.name = 'TypeError';
    throw e;
  };
  await assert.rejects(fetchCinemetaMeta('movie', 'tt-uniquetest3'), /Cinemeta non raggiungibile/);
});

// ---------------------------------------------------------------------------
// parseStreamId
// ---------------------------------------------------------------------------

test('parseStreamId: id propri', () => {
  assert.deepEqual(parseStreamId('iptv:123'), { own: true, kind: 'movie', streamId: '123' });
  assert.deepEqual(parseStreamId('iptv:123:1:2'), {
    own: true,
    kind: 'series',
    seriesId: '123',
    season: 1,
    episode: 2,
  });
});

test('parseStreamId: id esterni tt/tmdb', () => {
  assert.deepEqual(parseStreamId('tt0115341:1:1'), {
    own: false,
    base: 'tt0115341',
    season: 1,
    episode: 1,
  });
  assert.deepEqual(parseStreamId('tmdb605:3:4'), {
    own: false,
    base: 'tmdb605',
    season: 3,
    episode: 4,
  });
  assert.deepEqual(parseStreamId('tt0114319'), {
    own: false,
    base: 'tt0114319',
    season: undefined,
    episode: undefined,
  });
});

test('parseStreamId: formato sconosciuto -> null', () => {
  assert.equal(parseStreamId('tt0115341:1:1:extra'), null);
  assert.equal(parseStreamId('kinopoisk123'), null);
  assert.equal(parseStreamId(''), null);
  assert.equal(parseStreamId(undefined), null);
});

