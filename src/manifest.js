'use strict';

/**
 * Manifest dell'addon. I campi di configurazione (config array) generano il
 * form nativo di Stremio quando l'addon è installato senza configurazione;
 * la stessa configurazione viene anche gestita dalla pagina web servita su
 * "/" e "/configure".
 */

const manifest = {
  id: 'community.iptvvod',
  version: '1.1.0',
  name: 'IPTV VOD',
  description:
    'VOD movies and TV series from your IPTV provider (Xtream Codes). Resolves IDs from other catalog addons (IMDb/Cinemeta, TMDB, Xperience) against the IPTV server and provides streams, AIOStreams-compatible.',
  types: ['movie', 'series'],
  catalogs: [],
  resources: ['stream'],
  behaviorHints: { configurable: true },
  config: [
    { key: 'host', title: 'IPTV server URL (e.g. http://host:port)', type: 'text', required: true },
    { key: 'username', title: 'Username', type: 'text', required: true },
    { key: 'password', title: 'Password', type: 'password', required: true },
    {
      key: 'streamFormat',
      title: 'Stream format',
      type: 'select',
      options: ['aio', 'normal'],
      default: 'aio',
    },
    {
      key: 'defaultLanguage',
      title: 'Default language if not found (none = do not show)',
      type: 'select',
      options: ['none', 'ita', 'eng', 'fre', 'deu', 'spa', 'por', 'tur', 'rus', 'ara'],
      default: 'ita',
    },
  ],
};

module.exports = { manifest };
