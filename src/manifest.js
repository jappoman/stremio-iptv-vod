'use strict';

/**
 * Manifest dell'addon. I campi di configurazione (config array) generano il
 * form nativo di Stremio quando l'addon è installato senza configurazione;
 * la stessa configurazione viene anche gestita dalla pagina web servita su
 * "/" e "/configure".
 */

const manifest = {
  id: 'community.iptvvod',
  version: '1.0.1',
  name: 'IPTV VOD',
  description:
    'Fonti VOD e Serie TV dal tuo provider IPTV (Xtream Codes): risolve gli id di altri addon catalogo (IMDb/Cinemeta, TMDB, Xperience) verso il server IPTV e fornisce gli stream, compatibili AIOStreams.',
  types: ['movie', 'series'],
  catalogs: [],
  resources: ['stream'],
  behaviorHints: { configurable: true },
  config: [
    { key: 'host', title: 'URL server IPTV (es. http://host:port)', type: 'text', required: true },
    { key: 'username', title: 'Username', type: 'text', required: true },
    { key: 'password', title: 'Password', type: 'password', required: true },
    {
      key: 'streamFormat',
      title: 'Formato stream',
      type: 'select',
      options: ['aio', 'normal'],
      default: 'aio',
    },
    {
      key: 'defaultLanguage',
      title: 'Lingua di default se non trovata (nessuna = non mostrare)',
      type: 'select',
      options: ['none', 'ita', 'eng', 'fre', 'deu', 'spa', 'por', 'tur', 'rus', 'ara'],
      default: 'ita',
    },
  ],
};

module.exports = { manifest };
