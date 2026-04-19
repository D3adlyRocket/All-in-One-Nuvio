// VideoEasy Scraper for Nuvio Local Scrapers
// Extracts streaming links using TMDB ID for all VideoEasy servers

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Connection': 'keep-alive'
};

const DECRYPT_API = 'https://enc-dec.app/api/dec-videasy';
const TMDB_API_KEY = 'd131017ccc6e5462a81c9304d21476de';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const SERVERS = {
  'Neon': { url: 'https://api.videasy.net/myflixerzupcloud/sources-with-title', language: 'Original' },
  'Sage': { url: 'https://api.videasy.net/1movies/sources-with-title', language: 'Original' },
  'Cypher': { url: 'https://api.videasy.net/moviebox/sources-with-title', language: 'Original' },
  'Yoru': { url: 'https://api.videasy.net/cdn/sources-with-title', language: 'Original', moviesOnly: true },
  'Reyna': { url: 'https://api.videasy.net/primewire/sources-with-title', language: 'Original' },
  'Omen': { url: 'https://api.videasy.net/onionplay/sources-with-title', language: 'Original' },
  'Breach': { url: 'https://api.videasy.net/m4uhd/sources-with-title', language: 'Original' },
  'Vyse': { url: 'https://api.videasy.net/hdmovie/sources-with-title', language: 'Original' },
  'Ghost': { url: 'https://api.videasy.net/primesrcme/sources-with-title', language: 'Original' },
  'Killjoy': { url: 'https://api.videasy.net/meine/sources-with-title', language: 'German', params: { language: 'german' } },
  'Harbor': { url: 'https://api.videasy.net/meine/sources-with-title', language: 'Italian', params: { language: 'italian' } },
  'Chamber': { url: 'https://api.videasy.net/meine/sources-with-title', language: 'French', params: { language: 'french' }, moviesOnly: true },
  'Fade': { url: 'https://api.videasy.net/hdmovie/sources-with-title', language: 'Hindi' },
  'Gekko': { url: 'https://api.videasy.net/cuevana-latino/sources-with-title', language: 'Latin' },
  'Kayo': { url: 'https://api.videasy.net/cuevana-spanish/sources-with-title', language: 'Spanish' },
  'Raze': { url: 'https://api.videasy.net/superflix/sources-with-title', language: 'Portuguese' },
  'Phoenix': { url: 'https://api.videasy.net/overflix/sources-with-title', language: 'Portuguese' },
  'Astra': { url: 'https://api.videasy.net/visioncine/sources-with-title', language: 'Portuguese' }
};

function requestRaw(method, urlString, options) {
  return fetch(urlString, {
    method: method,
    headers: (options && options.headers) || {},
    body: (options && options.body) || undefined
  }).then(response => {
    return response.text().then(body => {
      if (response.ok) return { status: response.status, body: body };
      throw new Error(`HTTP ${response.status}`);
    });
  });
}

function getJson(url) {
  return requestRaw('GET', url, { headers: HEADERS }).then(res => JSON.parse(res.body));
}

function postJson(url, jsonBody) {
  const headers = Object.assign({}, HEADERS, { 'Content-Type': 'application/json' });
  return requestRaw('POST', url, { headers, body: JSON.stringify(jsonBody) }).then(res => JSON.parse(res.body));
}

function decryptVideoEasy(encryptedText, tmdbId) {
  // FIXED: Changed API to DECRYPT_API
  return postJson(DECRYPT_API, { text: encryptedText, id: tmdbId })
    .then(response => response.result || response);
}

function fetchMediaDetails(tmdbId, mediaType) {
  const type = mediaType === 'tv' ? 'tv' : 'movie';
  const url = `${TMDB_BASE_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
  return getJson(url).then(data => ({
    id: data.id,
    title: data.title || data.name,
    year: (data.release_date || data.first_air_date || '').split('-')[0],
    imdbId: data.external_ids ? data.external_ids.imdb_id : '',
    mediaType: type
  }));
}

function extractQuality(url) {
  if (url.includes('1080')) return '1080p';
  if (url.includes('720')) return '720p';
  if (url.includes('480')) return '480p';
  return '720p'; // Default fallback
}

function fetchFromServer(serverName, serverConfig, mediaType, title, year, tmdbId, imdbId, season, episode) {
  // Build params
  const params = { title, mediaType, year, tmdbId, imdbId };
  if (serverConfig.params) Object.assign(params, serverConfig.params);
  if (mediaType === 'tv') { params.seasonId = season; params.episodeId = episode; }

  const query = Object.keys(params)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');

  const url = `${serverConfig.url}?${query}`;

  return requestRaw('GET', url, { headers: HEADERS })
    .then(res => decryptVideoEasy(res.body, tmdbId))
    .then(decrypted => {
      if (!decrypted || !decrypted.sources) return [];
      return decrypted.sources.map(s => ({
        name: `VIDEASY ${serverName} [${serverConfig.language}]`,
        title: `${title} (${year})`,
        url: s.url,
        quality: s.quality || extractQuality(s.url),
        headers: Object.assign({}, HEADERS, { 'Referer': 'https://api.videasy.net/' }),
        provider: 'videasy'
      }));
    })
    .catch(() => []);
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return fetchMediaDetails(tmdbId, mediaType).then(details => {
    const promises = Object.keys(SERVERS).map(name => {
      const config = SERVERS[name];
      if (details.mediaType === 'tv' && config.moviesOnly) return Promise.resolve([]);
      
      return fetchFromServer(
        name, config, details.mediaType, details.title, 
        details.year, tmdbId, details.imdbId, seasonNum, episodeNum
      );
    });

    return Promise.all(promises).then(results => {
      const all = [].concat(...results);
      const seen = new Set();
      return all.filter(s => {
        const isDup = seen.has(s.url);
        seen.add(s.url);
        return !isDup;
      });
    });
  }).catch(() => []);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
