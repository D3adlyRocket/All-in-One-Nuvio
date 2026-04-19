// VideoEasy Scraper for Nuvio - Version 2.1 (ExoPlayer Fix)
// Extracts and authorizes streaming links for React Native

const TMDB_API_KEY = '1c29a5198ee1854bd5eb45dbe8d17d92';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const DECRYPT_API = 'https://enc-dec.app/api/dec-videasy';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://player.videasy.net',
  'Referer': 'https://player.videasy.net/'
};

const SERVERS = {
  'Neon': { url: 'https://api.videasy.net/myflixerzupcloud/sources-with-title', language: 'Original' },
  'Sage': { url: 'https://api.videasy.net/1movies/sources-with-title', language: 'Original' },
  'Cypher': { url: 'https://api.videasy.net/moviebox/sources-with-title', language: 'Original' },
  'Reyna': { url: 'https://api.videasy.net/primewire/sources-with-title', language: 'Original' },
  'Vyse': { url: 'https://api.videasy.net/hdmovie/sources-with-title', language: 'Original' },
  'Omen': { url: 'https://api.videasy.net/onionplay/sources-with-title', language: 'Original' },
  'Breach': { url: 'https://api.videasy.net/m4uhd/sources-with-title', language: 'Original' },
  'Gekko': { url: 'https://api.videasy.net/cuevana-latino/sources-with-title', language: 'Latin' },
  'Raze': { url: 'https://api.videasy.net/superflix/sources-with-title', language: 'Portuguese' }
};

// Internal Request Helper
function request(url, options = {}) {
  return fetch(url, {
    method: options.method || 'GET',
    headers: options.headers || HEADERS,
    body: options.body || null
  }).then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  });
}

// Decryption Logic
function decrypt(encryptedText, tmdbId) {
  if (!encryptedText) return Promise.resolve(null);
  
  // If API returns raw JSON instead of encrypted string
  if (encryptedText.trim().startsWith('{')) {
    try { return Promise.resolve(JSON.parse(encryptedText)); } catch(e) {}
  }

  return fetch(DECRYPT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: encryptedText, id: tmdbId.toString() })
  })
  .then(res => res.json())
  .then(data => data.result || data)
  .catch(err => {
    console.error("[Decryption] Failed:", err.message);
    return null;
  });
}

// TMDB Metadata Fetcher
function fetchMediaDetails(tmdbId, mediaType) {
  const type = mediaType === 'tv' ? 'tv' : 'movie';
  const url = `${TMDB_BASE_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
  
  return request(url).then(res => {
    const data = JSON.parse(res);
    return {
      id: tmdbId,
      title: data.title || data.name,
      year: (data.release_date || data.first_air_date || '').split('-')[0],
      imdbId: data.external_ids ? data.external_ids.imdb_id : '',
      type: type
    };
  });
}

// Individual Server Fetcher
function fetchFromServer(serverName, serverConfig, details, season, episode) {
  const params = {
    title: details.title,
    mediaType: details.type,
    year: details.year,
    tmdbId: details.id,
    imdbId: details.imdbId
  };

  if (details.type === 'tv') {
    params.seasonId = season;
    params.episodeId = episode;
  }

  const query = Object.keys(params)
    .filter(k => params[k])
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');

  return request(`${serverConfig.url}?${query}`)
    .then(raw => decrypt(raw, details.id))
    .then(decrypted => {
      if (!decrypted || !decrypted.sources) return [];
      
      return decrypted.sources.map(source => ({
        name: `VIDEASY ${serverName} [${serverConfig.language}]`,
        title: `${details.title} (${details.year})`,
        url: source.url,
        quality: source.quality || 'Auto',
        // CRITICAL: These headers fix ERROR_CODE_IO_BAD_HTTP_STATUS
        headers: {
          'User-Agent': HEADERS['User-Agent'],
          'Referer': 'https://player.videasy.net/',
          'Origin': 'https://player.videasy.net',
          'Accept': '*/*'
        },
        provider: 'videasy'
      }));
    })
    .catch(() => []);
}

// Main Function
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return fetchMediaDetails(tmdbId, mediaType)
    .then(details => {
      const promises = Object.keys(SERVERS).map(name => 
        fetchFromServer(name, SERVERS[name], details, seasonNum, episodeNum)
      );

      return Promise.all(promises).then(results => {
        const allStreams = results.flat();
        
        // Filter out duplicates
        const seenUrls = new Set();
        return allStreams.filter(stream => {
          if (seenUrls.has(stream.url)) return false
