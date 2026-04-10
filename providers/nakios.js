// =============================================================
// Provider Nuvio : Nakios.art (VF / VOSTFR / MULTI)
// Version : 1.0.0
// Stratégie :
//   1. tmdbId → sources via API nakios (films et séries)
//   2. On garde uniquement les URLs directes (non-proxy)
//   3. Les URLs proxy nécessitent un compte premium nakios
// =============================================================

var NAKIOS_API_DEFAULT = 'https://api.nakios.art/api';
var NAKIOS_API      = NAKIOS_API_DEFAULT;
var NAKIOS_REFERER_DEFAULT = 'https://nakios.art/';
var NAKIOS_REFERER  = NAKIOS_REFERER_DEFAULT;
var NAKIOS_UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var NAKIOS_REDIRECT = 'https://nakios.online/';
var NAKIOS_TELEGRAM = 'https://t.me/s/nakiosfr';

// ---------------------------------------------------------------
// Détection du domaine actif
// 1er choix : nakios.online (page de redirection)
// 2ème choix : Telegram @nakiosfr
// ---------------------------------------------------------------
function detectNakiosDomain() {
  return fetch(NAKIOS_REDIRECT, {
    method: 'GET',
    headers: { 'User-Agent': NAKIOS_UA }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var m = html.match(/https?:\/\/nakios\.[a-z]+/gi);
      if (!m) throw new Error('Aucun domaine sur nakios.online');
      var domains = m.filter(function(u) {
        return u.indexOf('nakios.online') === -1 && u.indexOf('t.me') === -1;
      });
      if (!domains.length) throw new Error('Aucun domaine valide');
      var base = domains[domains.length - 1].replace(/\/$/, '');
      console.log('[Nakios] Domaine via nakios.online:', base);
      return base;
    })
    .catch(function() {
      return fetch(NAKIOS_TELEGRAM, {
        method: 'GET',
        headers: { 'User-Agent': NAKIOS_UA }
      })
        .then(function(res) { return res.text(); })
        .then(function(html) {
          var m = html.match(/https?:\/\/nakios\.[a-z]+/gi);
          if (!m) return null;
          var domains = m.filter(function(u) {
            return u.indexOf('t.me') === -1 && u.indexOf('telegram') === -1;
          });
          if (!domains.length) return null;
          var base = domains[domains.length - 1].replace(/\/$/, '');
          console.log('[Nakios] Domaine via Telegram:', base);
          return base;
        })
        .catch(function() { return null; });
    });
}

function applyNakiosDomain(base) {
  NAKIOS_API     = base.replace(/\/$/, '') + '/api';
  NAKIOS_REFERER = base.replace(/\/$/, '') + '/';
}

// ---------------------------------------------------------------
// Récupère les sources d'un FILM
// GET /api/sources/movie/{tmdbId}
// ---------------------------------------------------------------
function fetchMovieSources(tmdbId) {
  var url = NAKIOS_API + '/sources/movie/' + tmdbId;
  console.log('[Nakios] Film sources: ' + url);

  return fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': NAKIOS_UA,
      'Referer': NAKIOS_REFERER,
      'Origin': 'https://nakios.art'
    }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      if (!data || !data.success || !data.sources || data.sources.length === 0) {
        throw new Error('Aucune source disponible');
      }
      return data.sources;
    });
}

// ---------------------------------------------------------------
// Récupère les sources d'une SÉRIE
// GET /api/sources/tv/{tmdbId}/{saison}/{episode}
// ---------------------------------------------------------------
function fetchTvSources(tmdbId, season, episode) {
  var s   = season  || 1;
  var e   = episode || 1;
  var url = NAKIOS_API + '/sources/tv/' + tmdbId + '/' + s + '/' + e;
  console.log('[Nakios] Série sources: ' + url);

  return fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': NAKIOS_UA,
      'Referer': NAKIOS_REFERER,
      'Origin': 'https://nakios.art'
    }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      if (!data || !data.success || !data.sources || data.sources.length === 0) {
        throw new Error('Aucune source disponible');
      }
      return data.sources;
    });
}

// ---------------------------------------------------------------
// Filtre et normalise les sources vers le format Nuvio
// On garde uniquement les URLs directes (pas de proxy nakios)
// ---------------------------------------------------------------
function normalizeSources(sources) {
  var results = [];

  for (var i = 0; i < sources.length; i++) {
    var source = sources[i];
    var url    = source.url || '';

    // Ignorer les URLs proxy (nécessitent compte premium)
    if (url.indexOf('/api/sources/proxy') === 0 || url.indexOf('api/sources/proxy') !== -1) {
      console.log('[Nakios] Ignoré proxy: ' + url.substring(0, 60));
      continue;
    }

    // Ignorer les URLs vides ou invalides
    if (!url || !url.startsWith('http')) {
      continue;
    }

    var lang    = source.lang    || 'MULTI';
    var quality = source.quality || 'HD';
    var isM3U8  = url.indexOf('.m3u8') !== -1 || source.isM3U8 === true;

    results.push({
      name:    'Nakios',
      title:   'Nakios ' + quality + ' | ' + lang,
      url:     url,
      quality: quality,
      format:  isM3U8 ? 'm3u8' : 'mp4',
      headers: {
        'User-Agent': NAKIOS_UA,
        'Referer':    NAKIOS_REFERER
      }
    });
  }

  return results;
}

// ---------------------------------------------------------------
// Fonction principale appelée par Nuvio
// ---------------------------------------------------------------
function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Nakios] START tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);

  var fetchSources = (mediaType === 'tv')
    ? fetchTvSources(tmdbId, season, episode)
    : fetchMovieSources(tmdbId);

  return fetchSources
    .then(function(sources) {
      var results = normalizeSources(sources);
      console.log('[Nakios] ' + results.length + ' source(s) directe(s) trouvée(s)');
      return results;
    })
    .catch(function(err) {
      console.warn('[Nakios] Échec domaine principal (' + err.message + '), détection nouveau domaine...');
      return detectNakiosDomain().then(function(newBase) {
        if (!newBase) throw new Error('Aucun domaine trouvé');
        applyNakiosDomain(newBase);
        var retryFetch = (mediaType === 'tv')
          ? fetchTvSources(tmdbId, season, episode)
          : fetchMovieSources(tmdbId);
        return retryFetch.then(function(sources) {
          var results = normalizeSources(sources);
          console.log('[Nakios] ' + results.length + ' source(s) après fallback');
          return results;
        });
      });
    })
    .catch(function(err) {
      console.error('[Nakios] Erreur: ' + (err.message || String(err)));
      return [];
    });
}

// ---------------------------------------------------------------
// Export
// ---------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
