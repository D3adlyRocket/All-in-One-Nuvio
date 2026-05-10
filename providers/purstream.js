// =============================================================
// Provider Nuvio : Purstream.art (VF/VOSTFR/MULTI)
// Version : 4.1.0
// - Header: Purstream - Quality
// - Line 1: 🎬 Movie Name - Year (or S/E info)
// - Line 2: 📺 Res | 🌍 Lang | 💾 Size | 🎞️ Format | ⏱️ Duration
// =============================================================

var DOMAINS_URL           = 'https://raw.githubusercontent.com/wooodyhood/nuvio-repo/main/domains.json';
var PURSTREAM_FALLBACK    = 'cx';
var PURSTREAM_API         = 'https://api.purstream.' + PURSTREAM_FALLBACK + '/api/v1';
var PURSTREAM_REFERER     = 'https://purstream.' + PURSTREAM_FALLBACK + '/';
var PURSTREAM_UA          = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var TMDB_KEY              = 'f3d757824f08ea2cff45eb8f47ca3a1e';

var _cachedEndpoint = null;

// ─── TMDB Helpers (Updated for Duration/Year) ────────────────

function getTmdbDetails(tmdbId, type) {
  var url = 'https://api.themoviedb.org/3/' + (type === 'tv' ? 'tv' : 'movie') + '/' + tmdbId + '?api_key=' + TMDB_KEY + '&language=en-US';
  return fetch(url).then(function(res) { return res.json(); }).then(function(data) {
      var date = data.release_date || data.first_air_date || "";
      return {
        enName: data.title || data.name || "Purstream",
        year: date ? date.split('-')[0] : "",
        duration: (type === 'movie' && data.runtime) ? data.runtime + ' min' : (type === 'tv' && data.episode_run_time && data.episode_run_time.length > 0 ? data.episode_run_time[0] + ' min' : "")
      };
  }).catch(function() { return { enName: "Purstream", year: "", duration: "" }; });
}

function getEpisodeInfo(tmdbId, season, episode) {
  if (!tmdbId || !season || !episode) return Promise.resolve(null);
  var url = 'https://api.themoviedb.org/3/tv/' + tmdbId + '/season/' + season + '/episode/' + episode + '?api_key=' + TMDB_KEY + '&language=en-US';
  return fetch(url).then(function(res) { return res.json(); }).then(function(data) {
      return { name: data.name || null, duration: data.runtime ? data.runtime + ' min' : null };
  }).catch(function() { return null; });
}

// ─── UI Helper: Two-Line Title Builder ───────────────────────

function buildPurstreamTitle(meta, res, lang, format, season, episode, epInfo) {
    var qIcon = (res.includes('2160') || res.includes('4K')) ? '💎' : '📺';
    var lIcon = '🇫🇷';
    var displayLang = 'VF';

    var check = (lang || "").toUpperCase();
    if (check.indexOf('MULTI') !== -1) {
        lIcon = '🌍';
        displayLang = 'MULTI';
    } else if (check.indexOf('VOST') !== -1) {
        lIcon = '🔡';
        displayLang = 'VOSTFR';
    }

    // Line 1: Identity
    var line1 = '🎬 ';
    if (season && episode) {
        line1 += 'S' + season + ' E' + episode + (epInfo && epInfo.name ? ' - ' + epInfo.name : '') + ' | ' + meta.enName;
    } else {
        line1 += meta.enName + (meta.year ? ' - ' + meta.year : '');
    }

    // Line 2: Technical Specs
    var columns = [
        qIcon + ' ' + res,
        lIcon + ' ' + displayLang,
        '🎞️ ' + (format || 'M3U8').toUpperCase()
    ];

    var finalDur = (epInfo && epInfo.duration) ? epInfo.duration : meta.duration;
    if (finalDur) columns.push('⏱️ ' + finalDur);

    return line1 + '\n' + columns.join(' | ');
}

// ─── API & Domain Logic (Untouched) ──────────────────────────

function detectPurstreamDomain() {
  if (_cachedEndpoint) return Promise.resolve(_cachedEndpoint);
  return fetch(DOMAINS_URL)
    .then(function(res) { if (!res.ok) throw new Error(); return res.json(); })
    .then(function(data) {
      var tld = data.purstream || PURSTREAM_FALLBACK;
      _cachedEndpoint = { api: 'https://api.purstream.' + tld + '/api/v1', referer: 'https://purstream.' + tld + '/' };
      return _cachedEndpoint;
    })
    .catch(function() {
      return { api: 'https://api.purstream.' + PURSTREAM_FALLBACK + '/api/v1', referer: 'https://purstream.' + PURSTREAM_FALLBACK + '/' };
    });
}

function applyPurstreamDomain(endpoint) {
  PURSTREAM_API     = endpoint.api;
  PURSTREAM_REFERER = endpoint.referer;
}

function cleanTitle(s) {
  if (!s) return '';
  return s.toLowerCase().replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function extractYear(dateStr) {
  if (!dateStr) return null;
  var m = String(dateStr).match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function getTmdbSearchMeta(tmdbId, mediaType) {
  var type = mediaType === 'tv' ? 'tv' : 'movie';
  var url = 'https://api.themoviedb.org/3/' + type + '/' + tmdbId + '?language=fr-FR&api_key=' + TMDB_KEY;
  return fetch(url).then(function(res) { return res.json(); }).then(function(data) {
      return { fr: data.title || data.name, orig: data.original_title || data.original_name, year: extractYear(data.release_date || data.first_air_date) };
  });
}

// ─── Search & Fetch ──────────────────────────────────────────

function findPurstreamIdByTitle(title, mediaType, tmdbYear) {
  var encoded = encodeURIComponent(title);
  return fetch(PURSTREAM_API + '/search-bar/search/' + encoded, { headers: { 'User-Agent': PURSTREAM_UA, 'Referer': PURSTREAM_REFERER } })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var items = data.data.items.movies && data.data.items.movies.items ? data.data.items.movies.items : [];
      if (items.length === 0) throw new Error();
      var cleanTarget = cleanTitle(title);
      var match = items.find(function(item) {
          var purYear = extractYear(item.release_date);
          return cleanTitle(item.title) === cleanTarget && (Math.abs(tmdbYear - purYear) <= 1 || !tmdbYear);
      }) || items[0];
      return match.id;
    });
}

function fetchMovieSources(purstreamId) {
  return fetch(PURSTREAM_API + '/media/' + purstreamId + '/sheet', { headers: { 'User-Agent': PURSTREAM_UA, 'Referer': PURSTREAM_REFERER } })
    .then(function(res) { return res.json(); }).then(function(data) { return data.data.items.urls || []; });
}

function fetchEpisodeSources(purstreamId, season, episode) {
  return fetch(PURSTREAM_API + '/stream/' + purstreamId + '/episode?season=' + (season || 1) + '&episode=' + (episode || 1), { headers: { 'User-Agent': PURSTREAM_UA, 'Referer': PURSTREAM_REFERER } })
    .then(function(res) { return res.json(); }).then(function(data) { return data.data.items.sources || []; });
}

// ─── Normalization ───────────────────────────────────────────

function parseLang(name) {
  var n = (name || '').toUpperCase();
  if (n.indexOf('VOSTFR') !== -1) return 'VOSTFR';
  if (n.indexOf('VF') !== -1) return 'VF';
  return 'MULTI';
}

function parseQuality(name) {
  var n = (name || '').toUpperCase();
  if (n.indexOf('4K') !== -1) return '4K';
  if (n.indexOf('1080') !== -1) return '1080p';
  if (n.indexOf('720') !== -1) return '720p';
  return 'HD';
}

function normalizeMovieSources(urls, meta) {
  return urls.filter(function(item) { return item.url && (item.url.match(/\.m3u8/i) || item.url.match(/\.mp4/i)); })
    .map(function(item) {
      var q = parseQuality(item.name);
      return {
        name: 'Purstream - ' + q,
        title: buildPurstreamTitle(meta, q, parseLang(item.name), item.url.match(/\.mp4/i) ? 'mp4' : 'm3u8', null, null, null),
        url: item.url,
        quality: q,
        format: item.url.match(/\.mp4/i) ? 'mp4' : 'm3u8',
        headers: { 'User-Agent': PURSTREAM_UA, 'Referer': PURSTREAM_REFERER }
      };
    });
}

function normalizeEpisodeSources(sources, meta, season, episode, epInfo) {
  return sources.map(function(item) {
    var q = parseQuality(item.source_name);
    return {
      name: 'Purstream - ' + q,
      title: buildPurstreamTitle(meta, q, parseLang(item.source_name), item.format || 'm3u8', season, episode, epInfo),
      url: item.stream_url,
      quality: q,
      format: item.format || 'm3u8',
      headers: { 'User-Agent': PURSTREAM_UA, 'Referer': PURSTREAM_REFERER }
    };
  });
}

// ─── Main ────────────────────────────────────────────────────

function getStreams(tmdbId, mediaType, season, episode) {
  return Promise.all([
    getTmdbDetails(tmdbId, mediaType),
    mediaType === 'tv' ? getEpisodeInfo(tmdbId, season, episode) : Promise.resolve(null),
    detectPurstreamDomain(),
    getTmdbSearchMeta(tmdbId, mediaType)
  ]).then(function(results) {
    var meta      = results[0]; // enName, year, duration
    var epInfo    = results[1]; // name, duration
    var endpoint  = results[2];
    var search    = results[3]; // fr title for search
    applyPurstreamDomain(endpoint);

    return findPurstreamIdByTitle(search.fr, mediaType, search.year)
      .catch(function() { return findPurstreamIdByTitle(search.orig, mediaType, search.year); })
      .then(function(purstreamId) {
        if (mediaType === 'tv') {
          return fetchEpisodeSources(purstreamId, season, episode).then(function(s) { 
              return normalizeEpisodeSources(s, meta, season, episode, epInfo); 
          });
        } else {
          return fetchMovieSources(purstreamId).then(function(u) { 
              return normalizeMovieSources(u, meta); 
          });
        }
      });
  }).catch(function() { return []; });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { getStreams };
else global.getStreams = getStreams;
