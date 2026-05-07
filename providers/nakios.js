// =============================================================
// Provider Nuvio : Nakios.art (VF / VOSTFR / MULTI)
// Version : 3.4.0
// Fix : URLs proxy → décoder url= (decodeURIComponent)
//       et utiliser le domaine de l'URL décodée comme Referer
//       xalaflix et darkibox acceptent leurs propres domaines
// =============================================================

var NAKIOS_API     = 'https://api.nakios.fit/api';
var NAKIOS_BASE    = 'https://nakios.fit';
var NAKIOS_REFERER = 'https://nakios.fit/';
var NAKIOS_UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function fetchSources(tmdbId, mediaType, season, episode) {
  var url = mediaType === 'tv'
    ? NAKIOS_API + '/sources/tv/' + tmdbId + '/' + (season || 1) + '/' + (episode || 1)
    : NAKIOS_API + '/sources/movie/' + tmdbId;

  console.log('[Nakios] Fetch sources: ' + url);

  return fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': NAKIOS_UA,
      'Referer':    NAKIOS_REFERER,
      'Origin':     NAKIOS_BASE
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

// Extrait le domaine origin depuis une URL (ex: https://zebi.xalaflix.design/...)
// → https://zebi.xalaflix.design
function extractOrigin(url) {
  var match = url.match(/^(https?:\/\/[^\/]+)/);
  return match ? match[1] : null;
}

// Résout une URL source :
// - URL directe http → retournée telle quelle
// - URL proxy relative /api/sources/proxy?url=ENCODED&s=xxx
//   → décoder le paramètre url= avec decodeURIComponent
//   → utiliser le domaine de l'URL décodée comme Referer/Origin
function resolveSource(source) {
  var rawUrl = source.url || '';

  // URL directe
  if (rawUrl.startsWith('http')) {
    var format = (source.isM3U8 || rawUrl.indexOf('.m3u8') !== -1) ? 'm3u8' : 'mp4';
    return {
      url:     rawUrl,
      format:  format,
      referer: NAKIOS_REFERER,
      origin:  NAKIOS_BASE
    };
  }

  // URL proxy relative → extraire et décoder le paramètre url=
  if (rawUrl.charAt(0) === '/') {
    var urlMatch = rawUrl.match(/[?&]url=([^&]+)/);
    if (!urlMatch) return null;

    var decoded;
    try {
      decoded = decodeURIComponent(urlMatch[1]);
    } catch (e) {
      return null;
    }

    if (!decoded || !decoded.startsWith('http')) return null;

    var origin = extractOrigin(decoded);
    if (!origin) return null;

    return {
      url:     decoded,
      format:  'm3u8',
      referer: origin + '/',
      origin:  origin
    };
  }

  return null;
}

function normalizeSources(sources) {
  var results = [];

  for (var i = 0; i < sources.length; i++) {
    var source = sources[i];

    if (source.isEmbed) continue;

    var lang    = (source.lang    || 'MULTI').toUpperCase();
    var quality = source.quality  || 'HD';
    var name    = source.name     || 'Nakios';

    var resolved = resolveSource(source);
    if (!resolved) continue;

    console.log('[Nakios] +source: ' + quality + ' | ' + lang + ' | ' + resolved.format +
                ' | referer=' + resolved.referer + ' → ' + resolved.url.substring(0, 70));

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

function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Nakios] START tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);

  return fetchSources(tmdbId, mediaType, season, episode)
    .then(function(sources) {
      var results = normalizeSources(sources);
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
