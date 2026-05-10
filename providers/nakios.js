// =============================================================
// Provider Nuvio : Nakios (VF / VOSTFR / MULTI)
// Version : 4.1.0
// - Header: Nakios - Quality
// - Added Movie Title + Year and Duration
// =============================================================

var TMDB_KEY = 'f3d757824f08ea2cff45eb8f47ca3a1e';
var NAKIOS_UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var DOMAINS_URL     = 'https://raw.githubusercontent.com/wooodyhood/nuvio-repo/main/domains.json';
var NAKIOS_FALLBACK = 'fit';

var _cachedEndpoint = null;

// ─── TMDB Helpers ───────────────────────────────────────────

function getTmdbMetadata(tmdbId, type) {
  var url = 'https://api.themoviedb.org/3/' + (type === 'tv' ? 'tv' : 'movie') + '/' + tmdbId + '?api_key=' + TMDB_KEY + '&language=en-US';
  return fetch(url)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var name = data.title || data.name || "Nakios";
      var date = data.release_date || data.first_air_date || "";
      var year = date ? date.split('-')[0] : "";
      
      var duration = "";
      // Movie duration
      if (type === 'movie' && data.runtime) {
          duration = data.runtime + ' min';
      } 
      // Series fallback duration (general)
      else if (type === 'tv' && data.episode_run_time && data.episode_run_time.length > 0) {
          duration = data.episode_run_time[0] + ' min';
      }
      
      return { name: name, year: year, duration: duration };
    })
    .catch(function() { return { name: "Nakios", year: "", duration: "" }; });
}

// Updated to fetch Episode Name AND Episode Duration
function getEpisodeInfo(tmdbId, season, episode) {
  if (!tmdbId || !season || !episode) return Promise.resolve(null);
  var url = 'https://api.themoviedb.org/3/tv/' + tmdbId + '/season/' + season + '/episode/' + episode + '?api_key=' + TMDB_KEY + '&language=en-US';
  return fetch(url)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      return {
          name: data.name || null,
          duration: data.runtime ? data.runtime + ' min' : null
      };
    })
    .catch(function() { return null; });
}

// ─── Construction de l'endpoint ──────────────────────────────

function buildEndpoint(tld) {
  var baseDomain = tld.includes('nakios') ? tld : 'nakios.' + tld;
  return {
    base:    'https://' + baseDomain,
    api:     'https://api.' + baseDomain + '/api',
    referer: 'https://' + baseDomain + '/'
  };
}

function detectEndpoint() {
  if (_cachedEndpoint) return Promise.resolve(_cachedEndpoint);
  return fetch(DOMAINS_URL)
    .then(function(res) { return res.ok ? res.json() : Promise.reject(); })
    .then(function(data) {
      _cachedEndpoint = buildEndpoint(data.nakios || NAKIOS_FALLBACK);
      return _cachedEndpoint;
    })
    .catch(function() {
      _cachedEndpoint = buildEndpoint(NAKIOS_FALLBACK);
      return _cachedEndpoint;
    });
}

// ─── Logic ───────────────────────────────────────────────────

function extractOrigin(url) {
  var m = url.match(/^(https?:\/\/[^\/]+)/);
  return m ? m[1] : null;
}

function resolveSource(source, endpoint) {
  var rawUrl = source.url || '';
  if (rawUrl.startsWith('http')) {
    return {
      url: rawUrl,
      format: (source.isM3U8 || rawUrl.indexOf('.m3u8') !== -1) ? 'm3u8' : 'mp4',
      referer: endpoint.referer,
      origin: endpoint.base
    };
  }
  if (rawUrl.charAt(0) === '/') {
    var urlMatch = rawUrl.match(/[?&]url=([^&]+)/);
    if (!urlMatch) return null;
    var decoded;
    try { decoded = decodeURIComponent(urlMatch[1]); } catch (e) { return null; }
    var origin = extractOrigin(decoded);
    return {
      url: decoded,
      format: 'm3u8',
      referer: origin ? origin + '/' : endpoint.referer,
      origin: origin || endpoint.base
    };
  }
  return null;
}

// ─── UI / Formatting ─────────────────────────────────────────

function normalizeSources(sources, endpoint, meta, season, episode, epInfo) {
  var results = [];
  for (var i = 0; i < sources.length; i++) {
    var s = sources[i];
    if (s.isEmbed) continue;

    var resolved = resolveSource(s, endpoint);
    if (!resolved) continue;

    var quality = s.quality || 'HD';
    var rawLang = (s.lang || 'MULTI').toUpperCase();
    var format  = resolved.format.toUpperCase();
    
    var langIcon = '🇫🇷'; 
    var langLabel = 'VF';
    if (rawLang.indexOf('MULTI') !== -1 || (s.name && s.name.toUpperCase().indexOf('MULTI') !== -1)) {
        langIcon = '🌍';
        langLabel = 'MULTI';
    } else if (rawLang.indexOf('VOST') !== -1) {
        langIcon = '🔡';
        langLabel = 'VOSTFR';
    }

    // Line 1: Identity
    var line1 = '🎬 ';
    if (season && episode) {
        var epTitle = epInfo && epInfo.name ? ' - ' + epInfo.name : '';
        line1 += 'S' + season + ' E' + episode + epTitle + ' | ' + meta.name;
    } else {
        line1 += meta.name + (meta.year ? ' - ' + meta.year : '');
    }

    // Line 2: Tech Specs
    var specs = [
        '📺 ' + quality,
        langIcon + ' ' + langLabel,
        '🎞️ ' + format
    ];
    if (s.size) specs.push('💾 ' + s.size);
    
    // Priority: Episode Duration -> Series General Duration
    var finalDuration = (epInfo && epInfo.duration) ? epInfo.duration : meta.duration;
    if (finalDuration) specs.push('⏱️ ' + finalDuration);

    results.push({
      name: 'Nakios - ' + quality, 
      title: line1 + '\n' + specs.join(' | '),
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

// ─── Entry Point ─────────────────────────────────────────────

function getStreams(tmdbId, mediaType, season, episode) {
  return Promise.all([
    getTmdbMetadata(tmdbId, mediaType),
    mediaType === 'tv' ? getEpisodeInfo(tmdbId, season, episode) : Promise.resolve(null),
    detectEndpoint()
  ]).then(function(results) {
    var meta = results[0];
    var epInfo = results[1];
    var endpoint = results[2];

    var url = mediaType === 'tv'
      ? endpoint.api + '/sources/tv/' + tmdbId + '/' + (season || 1) + '/' + (episode || 1)
      : endpoint.api + '/sources/movie/' + tmdbId;

    return fetch(url, {
      headers: { 'User-Agent': NAKIOS_UA, 'Referer': endpoint.referer }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.success || !data.sources) return [];
      
      var sNum = mediaType === 'tv' ? season : null;
      var eNum = mediaType === 'tv' ? episode : null;
      
      return normalizeSources(data.sources, endpoint, meta, sNum, eNum, epInfo);
    });
  }).catch(function() { return []; });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
