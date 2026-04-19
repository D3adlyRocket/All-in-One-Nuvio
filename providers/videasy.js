// VideoEasy Scraper for Nuvio - Updated April 2026
const TMDB_API_KEY = '1c29a5198ee1854bd5eb45dbe8d17d92'; // Use your verified key here
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const DECRYPT_API = 'https://enc-dec.app/api/dec-videasy';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://videasy.net',
  'Referer': 'https://videasy.net/'
};

const SERVERS = {
  'Neon': { url: 'https://api.videasy.net/myflixerzupcloud/sources-with-title', language: 'Original' },
  'Sage': { url: 'https://api.videasy.net/1movies/sources-with-title', language: 'Original' },
  'Cypher': { url: 'https://api.videasy.net/moviebox/sources-with-title', language: 'Original' },
  'Reyna': { url: 'https://api.videasy.net/primewire/sources-with-title', language: 'Original' },
  'Vyse': { url: 'https://api.videasy.net/hdmovie/sources-with-title', language: 'Original' },
  'Gekko': { url: 'https://api.videasy.net/cuevana-latino/sources-with-title', language: 'Latin' },
  'Raze': { url: 'https://api.videasy.net/superflix/sources-with-title', language: 'Portuguese' }
};

// Simplified Request Helper
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

function decrypt(encryptedText, tmdbId) {
  // If the text looks like JSON, don't try to decrypt it
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

function fetchMediaDetails(tmdbId, mediaType) {
  const type = mediaType === 'tv' ? 'tv' : 'movie';
  const url = `${TMDB_BASE_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
  
  return request(url).then(res => {
    const data = JSON.parse(res);
    return {
      title: data.title || data.name,
      year: (data.release_date || data.first_air_date || '').split('-')[0],
      imdbId: data.external_ids ? data.external_ids.imdb_id : '',
      type: type
    };
  });
}

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
        url: source.url,
        quality: source.quality || 'Auto',
        headers: {
          'Referer': 'https://api.videasy.net/',
          'User-Agent': HEADERS['User-Agent']
        }
      }));
    })
    .catch(err => {
      console.log(`[${serverName}] Error:`, err.message);
      return [];
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log(`[VideoEasy] Extracting ID: ${tmdbId}`);

  return fetchMediaDetails(tmdbId, mediaType)
    .then(details => {
      details.id = tmdbId; // Ensure ID is passed for decryption
      const promises = Object.keys(SERVERS).map(name => 
        fetchFromServer(name, SERVERS[name], details, season, episode)
      );

      return Promise.all(promises).then(results => {
        const flatResults = results.flat();
        console.log(`[VideoEasy] Total links found: ${flatResults.length}`);
        return flatResults;
      });
    })
    .catch(err => {
      console.error("[VideoEasy] Master Error:", err.message);
      return [];
    });
}

// Export for Nuvio
if (typeof module !== 'undefined') module.exports = { getStreams };
