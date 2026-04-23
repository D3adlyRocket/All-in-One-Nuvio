// =============================================================
// Provider Nuvio : ToFlix (VF français)
// =============================================================

var DOMAINS_URL    = 'https://raw.githubusercontent.com/wooodyhood/nuvio-repo/main/domains.json';
var TOFLIX_FALLBACK = 'sbs';
var TOFLIX_API     = 'https://api.toflix.' + TOFLIX_FALLBACK + '/toflix_api.php';
var TOFLIX_REFERER = 'https://toflix.' + TOFLIX_FALLBACK + '/';
var TOFLIX_TOKEN   = 'TobiCocoToflix2025TokenDeLaV2MeilleurSiteDeStreaminAuMondeEntierQuiEcraseToutSurSonCheminNeDevenezPasJalouxBandeDeNoobs';
var ZEUS_BASE      = 'https://apis.wavewatch.xyz/zeus.php';
var ZEUS_REFERER   = 'https://toflix.' + TOFLIX_FALLBACK + '/';

var _cachedEndpoint = null;

// ---------------------------------------------------------------
// Récupération du domaine depuis domains.json (GitHub)
// Fallback hardcodé : toflix.sbs
// ---------------------------------------------------------------
function detectToflixEndpoint() {
  if (_cachedEndpoint) return Promise.resolve(_cachedEndpoint);

  return fetch(DOMAINS_URL)
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      var tld = data.toflix;
      if (!tld) throw new Error('Domaine toflix absent du fichier');
      console.log('[ToFlix] Domaine récupéré: toflix.' + tld);
      _cachedEndpoint = {
        api:     'https://api.toflix.' + tld + '/toflix_api.php',
        referer: 'https://toflix.' + tld + '/'
      };
      return _cachedEndpoint;
    })
    .catch(function() {
      console.warn('[ToFlix] domains.json échoué, fallback: toflix.' + TOFLIX_FALLBACK);
      return {
        api:     'https://api.toflix.' + TOFLIX_FALLBACK + '/toflix_api.php',
        referer: 'https://toflix.' + TOFLIX_FALLBACK + '/'
      };
    });
}

function callApi(apiUrl, referer, body) {
  return fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'tfxtoken': TOFLIX_TOKEN,
      'Origin': referer.replace(/\/$/, ''),
      'Referer': referer
    },
    body: JSON.stringify(body)
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
}

// Base64 compatible Hermes (pas d'atob ni Buffer)
function b64decode(str) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  var output = '';
  str = str.replace(/[^A-Za-z0-9+/=]/g, '');
  for (var i = 0; i < str.length;) {
    var enc1 = chars.indexOf(str.charAt(i++));
    var enc2 = chars.indexOf(str.charAt(i++));
    var enc3 = chars.indexOf(str.charAt(i++));
    var enc4 = chars.indexOf(str.charAt(i++));
    var chr1 = (enc1 << 2) | (enc2 >> 4);
    var chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    var chr3 = ((enc3 & 3) << 6) | enc4;
    output += String.fromCharCode(chr1);
    if (enc3 !== 64) output += String.fromCharCode(chr2);
    if (enc4 !== 64) output += String.fromCharCode(chr3);
  }
  return output.replace(/[^\x20-\x7E]/g, '').trim();
}

// =============================================================
// Parsing SSE Zeus — validé par tests console F12
//
// 3 types d'URLs possibles dans src.url :
//   1. ?stream=BASE64  → MP4 via proxy Zeus (ex: allo)
//      → finalUrl = ZEUS_BASE + src.url, format mp4
//   2. ?proxy=BASE64&ref=BASE64 → m3u8 direct (ex: xalaflix)
//      → décoder proxy = url m3u8, décoder ref = referer
//   3. ?proxy=BASE64 sans ref → proxy nakios (503, ignoré)
//      → finalUrl = ZEUS_BASE + src.url (fallback)
//
// Règles :
//   - iframe:true  → toujours ignoré
//   - nakios.art   → ignoré (serveur 503)
// =============================================================

function parseZeusSse(text, labelFn) {
  var streams = [];
  var lines = text.split('\n');
  var currentEvent = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();

    if (line.indexOf('event:') === 0) {
      currentEvent = line.replace('event:', '').trim();
      continue;
    }

    if (line.indexOf('data:') === 0 && currentEvent === 'sources') {
      try {
        var json = JSON.parse(line.replace('data:', '').trim());
        var sources = json.sources || [];

        for (var j = 0; j < sources.length; j++) {
          var src = sources[j];

          // Ignorer les iframes (lecteurs embarqués)
          if (!src.url || src.iframe) continue;

          var finalUrl = null;
          var streamReferer = ZEUS_REFERER;
          var format = src.format || 'mp4';

          // --- Cas 1 : ?stream=BASE64 (ex: allo → MP4 via Zeus proxy) ---
          var streamMatch = src.url.match(/[?&]stream=([^&]+)/);
          if (streamMatch) {
            finalUrl = ZEUS_BASE + (src.url.charAt(0) === '?' ? src.url : '?' + src.url);
            format = 'mp4';

          } else {
            // --- Cas 2 & 3 : ?proxy=BASE64 ---
            var proxyMatch = src.url.match(/[?&]proxy=([^&]+)/);
            if (proxyMatch) {
              var decodedUrl = b64decode(proxyMatch[1]);

              if (decodedUrl && decodedUrl.indexOf('http') === 0) {
                // Ignorer nakios (serveur 503 confirmé)
                if (decodedUrl.indexOf('nakios.art') !== -1) continue;

                finalUrl = decodedUrl;
                format = 'm3u8';

                // Décoder le referer si présent (ex: xalaflix)
                var refMatch = src.url.match(/[?&]ref=([^&]+)/);
                if (refMatch) {
                  var decodedRef = b64decode(refMatch[1]);
                  if (decodedRef && decodedRef.indexOf('http') === 0) {
                    streamReferer = decodedRef;
                  }
                }
              } else {
                // Base64 ne donne pas une URL http → fallback Zeus
                finalUrl = ZEUS_BASE + (src.url.charAt(0) === '?' ? src.url : '?' + src.url);
                format = 'mp4';
              }
            }
          }

          if (!finalUrl) continue;

          var lang = (src.lang || 'VF').toUpperCase();
          var quality = src.quality || 'HD';
          var provider = (src.provider || 'zeus').toUpperCase();

          streams.push({
            name: 'ToFlix ' + provider,
            title: labelFn(src, lang, quality),
            url: finalUrl,
            quality: quality,
            format: format,
            headers: {
              'Referer': streamReferer,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
        }
      } catch (e) {}
    }
  }

  return streams;
}

function fetchZeusUrl(sseUrl, labelFn) {
  return fetch(sseUrl, {
    headers: {
      'Referer': ZEUS_REFERER,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/event-stream'
    }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('Zeus HTTP ' + res.status);
      return res.text();
    })
    .then(function(text) {
      var streams = parseZeusSse(text, labelFn);
      if (streams.length === 0) throw new Error('Zeus: aucune source directe');
      return streams;
    });
}

// =============================================================
// FILMS
// =============================================================

function fetchMovieFastFlux(apiUrl, referer, tmdbId) {
  return callApi(apiUrl, referer, { api: 'fastflux', endpoint: 'movie', tmdb_id: String(tmdbId) })
    .then(function(data) {
      if (!data || !data.success || !data.source_url) throw new Error('Film non disponible');
      return [{
        name: 'ToFlix',
        title: (data.title || 'ToFlix') + ' - VF',
        url: data.source_url,
        quality: 'HD',
        format: data.source && data.source.type === 'm3u8' ? 'm3u8' : 'mp4',
        headers: {
          'Referer': referer,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }];
    });
}

function fetchMovieZeus(tmdbId) {
  var sseUrl = ZEUS_BASE + '?sse&type=movie&id=' + tmdbId;
  return fetchZeusUrl(sseUrl, function(src, lang, quality) {
    return (src.name || 'ToFlix') + ' - ' + lang + ' ' + quality;
  });
}

function fetchMovie(apiUrl, referer, tmdbId) {
  var fastfluxPromise = fetchMovieFastFlux(apiUrl, referer, tmdbId)
    .catch(function() { return []; });
  var zeusPromise = fetchMovieZeus(tmdbId)
    .catch(function() { return []; });

  return Promise.all([fastfluxPromise, zeusPromise])
    .then(function(results) {
      var streams = results[0].concat(results[1]);
      if (streams.length === 0) throw new Error('Film non disponible');
      return streams;
    });
}

// =============================================================
// SÉRIES
// =============================================================

function fetchSeriesFastFlux(apiUrl, referer, tmdbId, season, episode) {
  return callApi(apiUrl, referer, {
    api: 'fastflux',
    endpoint: 'serie/fastflux_episodes',
    tmdb_id: String(tmdbId)
  })
    .then(function(data) {
      if (!data || !data.success || !data.seasons) throw new Error('FastFlux non disponible');
      var seasonKey = String(season);
      if (!data.seasons[seasonKey]) throw new Error('Saison ' + season + ' non disponible');
      var episodes = data.seasons[seasonKey];
      for (var i = 0; i < episodes.length; i++) {
        var ep = episodes[i];
        if (ep.episode_number === episode) {
          var url = ep.url || (ep.source && ep.source.url);
          if (!url) throw new Error('URL non trouvee pour S' + season + 'E' + episode);
          return [{
            name: 'ToFlix',
            title: 'S' + season + 'E' + episode + ' - ' + (ep.title || 'VF'),
            url: url,
            quality: 'HD',
            format: url.indexOf('.m3u8') !== -1 ? 'm3u8' : 'mp4',
            headers: {
              'Referer': referer,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          }];
        }
      }
      throw new Error('Episode S' + season + 'E' + episode + ' non trouve en FastFlux');
    });
}

function fetchSeriesZeus(tmdbId, season, episode) {
  var sseUrl = ZEUS_BASE + '?sse&type=tv&id=' + tmdbId + '&s=' + season + '&e=' + episode;
  return fetchZeusUrl(sseUrl, function(src, lang, quality) {
    return 'S' + season + 'E' + episode + ' - ' + (src.name || lang) + ' ' + quality;
  });
}

function fetchSeries(apiUrl, referer, tmdbId, season, episode) {
  var seasonNum = season || 1;
  var episodeNum = episode || 1;

  var fastfluxPromise = fetchSeriesFastFlux(apiUrl, referer, tmdbId, seasonNum, episodeNum)
    .catch(function() { return []; });
  var zeusPromise = fetchSeriesZeus(tmdbId, seasonNum, episodeNum)
    .catch(function() { return []; });

  return Promise.all([fastfluxPromise, zeusPromise])
    .then(function(results) {
      var streams = results[0].concat(results[1]);
      if (streams.length === 0) throw new Error('Aucune source disponible');
      return streams;
    });
}

// =============================================================
// POINT D'ENTRÉE PRINCIPAL
// =============================================================

function getStreamsWithApi(apiUrl, referer, tmdbId, mediaType, season, episode) {
  if (mediaType === 'tv') {
    return fetchSeries(apiUrl, referer, tmdbId, season, episode);
  }
  return fetchMovie(apiUrl, referer, tmdbId);
}

function getStreams(tmdbId, mediaType, season, episode, title) {
  return detectToflixEndpoint()
    .then(function(endpoint) {
      TOFLIX_API     = endpoint.api;
      TOFLIX_REFERER = endpoint.referer;
      ZEUS_REFERER   = endpoint.referer;
      return getStreamsWithApi(endpoint.api, endpoint.referer, tmdbId, mediaType, season, episode);
    })
    .catch(function(err) {
      console.error('[ToFlix] Erreur:', err.message || err);
      return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
