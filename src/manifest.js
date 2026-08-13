'use strict';

/**
 * Addon manifest. The configuration fields (config array) generate the
 * native Stremio form when the addon is installed without configuration;
 * the same configuration is also handled by the web page served at
 * "/" and "/configure".
 */

const manifest = {
  id: 'community.iptvvod',
  version: '1.2.0',
  name: 'IPTV VOD',
  description:
    'Use VOD movies and TV series from your Xtream Codes IPTV account in Stremio. Looks up IMDb and TMDB titles from other addons and returns direct streams.',
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
      default: 'eng',
    },
  ],
};

module.exports = { manifest };
