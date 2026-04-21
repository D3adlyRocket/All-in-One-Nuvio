// =============================================================
// Provider Nuvio : Nakios (VF / VOSTFR / MULTI)
// Version : 3.7.0
// - Domaine récupéré automatiquement depuis domains.json (GitHub)
// - Fallback sur nakios.fit si la lecture échoue
// =============================================================

var NAKIOS_UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var DOMAINS_URL     = 'https://raw.githubusercontent.com/wooodyhood/nuvio-repo/main/domains.json';
var NAKIOS_FALLBACK = 'nakios.fit';

var _cachedEndpoint = null;

// ─── Construction de l'endpoint ──────────────────────────────

function buildEndpoint(tld) {
  return {
    base:    'https://nakios.' + tld,
    api:     'https://api.nakios.' + tld + '/api',
    referer: 'https://nakios.' + tld + '/'
  };
}

// ─── Récupération du domaine depuis GitHub ───────────────────

function detectEndpoint() {
  if (_cachedEndpoint) {
    return Promise.resolve(_cachedEndpoint);
  }

  return fetch(DOMAINS_URL)
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      var tld = data.nakios;
      if (!tld) throw new Error('Domaine nakios absent du fichier');
      console.log('[Nakios] Domaine récupéré: nakios.' + tld);
      _cachedEndpoint = buildEndpoint(tld);
      return _cachedEndpoint;
    })
    .catch(function(err) {
      console.warn('[Nakios] Lecture domains.json échouée (' + (err.message || err) + '), fallback: ' + NAKIOS_FALLBACK);
      _cachedEndpoint = buildEndpoint(NAKIOS_FALLBACK);
      return _cachedEndpoint;
    });
}

// ─── Fetch sources ───────────────────────────────────────────

function fetchSources(endpoint, tmdbId, mediaType, season, episode) {
  var url = mediaType === 'tv'
    ? endpoint.api + '/sources/tv/' + tmdbId + '/' + (season || 1) + '/' + (episode || 1)
    : endpoint.api + '/sources/movie/' + tmdbId;

  console.log('[Nakios] Fetch: ' + url);

  return fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': NAKIOS_UA,
      'Referer':    endpoint.referer,
      'Origin':     endpoint.base
    }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      if (!data || !data.success || !data.sources || data.sources.length === 0) {
        throw new Error('Aucune source');
      }
      return data.sources;
    });
}

// ─── Résolution des URLs ─────────────────────────────────────

function extractOrigin(url) {
  var m = url.match(/^(https?:\/\/[^\/]+)/);
  return m ? m[1] : null;
}

function resolveSource(source, endpoint) {
  var rawUrl = source.url || '';

  // URL directe (ex: cdn.fastflux.xyz)
  if (rawUrl.startsWith('http')) {
    return {
      url:     rawUrl,
      format:  (source.isM3U8 || rawUrl.indexOf('.m3u8') !== -1) ? 'm3u8' : 'mp4',
      referer: endpoint.referer,
      origin:  endpoint.base
    };
  }

  // URL proxy relative → /api/sources/proxy?url=ENCODED&s=xxx
  if (rawUrl.charAt(0) === '/') {
    return {
      url:     endpoint.base + rawUrl,
      format:  'm3u8',
      referer: endpoint.referer,
      origin:  endpoint.base
    };
  }

  return null;
}

// ─── Normalisation ───────────────────────────────────────────

function normalizeSources(sources, endpoint) {
  var results = [];

  for (var i = 0; i < sources.length; i++) {
    var source  = sources[i];
    if (source.isEmbed) continue;

    var lang    = (source.lang    || 'MULTI').toUpperCase();
    var quality = source.quality  || 'HD';
    var name    = source.name     || 'Nakios';

    var resolved = resolveSource(source, endpoint);
    if (!resolved) continue;

    console.log('[Nakios] +' + quality + ' ' + lang + ' ' + resolved.format + ' → ' + resolved.url.substring(0, 70));

    results.push({
      name:    'Nakios',
      title:   name + ' - ' + lang + ' ' + quality,
      url:     resolved.url,
      quality: quality,
      format:  resolved.format,
      headers: {
        'User-Agent': NAKIOS_UA,
        'Referer':    resolved.referer,
        'Origin':     resolved.origin
      }
    });
  }

  return results;
}

// ─── Point d'entrée ──────────────────────────────────────────

function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Nakios] START tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);

  return detectEndpoint()
    .then(function(endpoint) {
      return fetchSources(endpoint, tmdbId, mediaType, season, episode)
        .then(function(sources) {
          return normalizeSources(sources, endpoint);
        })
        .catch(function(err) {
          console.warn('[Nakios] Endpoint ' + endpoint.base + ' KO, reset cache');
          _cachedEndpoint = null;
          throw err;
        });
    })
    .then(function(results) {
      console.log('[Nakios] ' + results.length + ' source(s) disponible(s)');
      return results;
    })
    .catch(function(err) {
      console.error('[Nakios] Erreur: ' + (err.message || String(err)));
      return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
