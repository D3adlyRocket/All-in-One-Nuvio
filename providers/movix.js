// =============================================================
// Provider Nuvio : Movix (VF/VOSTFR français)
// Version : 4.4.1
// - Added Columns: Resolution | Size | Language | Format | Extra
// - Visual: Integrated Icons for all metadata
// =============================================================

var TMDB_KEY = 'f3d757824f08ea2cff45eb8f47ca3a1e';
var DOMAINS_URL = 'https://raw.githubusercontent.com/wooodyhood/nuvio-repo/main/domains.json';
var MOVIX_FALLBACK = 'cash';

var _cachedEndpoint = null;

// 1. Updated buildTitle with "Force Multi" logic
function buildTitle(provider, res, lang, format, size, extra) {
    var qIcon = (res.includes('2160') || res.includes('4K')) ? '💎' : '📺';
    var lIcon = '🇫🇷'; // Default to VF
    var displayLang = 'VF';

    // Normalize everything to uppercase to compare
    var check = (provider + " " + lang + " " + res).toUpperCase();

    if (check.indexOf('MULTI') !== -1) {
        lIcon = '🌍';
        displayLang = 'MULTI';
    } else if (check.indexOf('VOST') !== -1) {
        lIcon = '🔡';
        displayLang = 'VOSTFR';
    } else {
        lIcon = '🇫🇷';
        displayLang = 'VF';
    }

    var columns = [
        '🎬 ' + (provider.length > 20 ? provider.substring(0, 17) + "..." : provider),
        qIcon + ' ' + res,
        lIcon + ' ' + displayLang,
        '🎞️ ' + (format || 'M3U8').toUpperCase()
    ];

    if (size) columns.push('💾 ' + size);
    if (extra) columns.push('🛠️ ' + extra);

    return columns.join(' | ');
}

// ─── Récupération du domaine depuis GitHub ───────────────────

function detectApi() {
  if (_cachedEndpoint) return Promise.resolve(_cachedEndpoint);

  return fetch(DOMAINS_URL)
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      var tld = data.movix;
      if (!tld) throw new Error('Domaine movix absent du fichier');
      _cachedEndpoint = {
        api:     'https://api.movix.' + tld,
        referer: 'https://movix.' + tld + '/'
      };
      return _cachedEndpoint;
    })
    .catch(function(err) {
      _cachedEndpoint = {
        api:     'https://api.movix.' + MOVIX_FALLBACK,
        referer: 'https://movix.' + MOVIX_FALLBACK + '/'
      };
      return _cachedEndpoint;
    });
}

function resolveRedirect(url, referer) {
  return fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': referer
    }
  }).then(function(res) { return res.url || url; })
    .catch(function() { return url; });
}

function resolveEmbed(embedUrl, referer) {
  return fetch(embedUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': referer
    }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var patterns = [
        /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
        /source\s+src=["']([^"']+\.m3u8[^"']*)["']/i,
        /["']([^"']*\.m3u8(?:\?[^"']*)?)["']/i,
        /file\s*:\s*["']([^"']+\.mp4[^"']*)["']/i
      ];
      for (var i = 0; i < patterns.length; i++) {
        var match = html.match(patterns[i]);
        if (match) {
          var url = match[1];
          if (url.startsWith('//')) url = 'https:' + url;
          if (url.startsWith('http')) return url;
        }
      }
      return null;
    })
    .catch(function() { return null; });
}

// API 1 : Purstream
function fetchPurstream(apiBase, referer, tmdbId, mediaType, season, episode) {
  var url = mediaType === 'tv'
    ? apiBase + '/api/purstream/tv/' + tmdbId + '/stream?season=' + (season || 1) + '&episode=' + (episode || 1)
    : apiBase + '/api/purstream/movie/' + tmdbId + '/stream';

  return fetch(url, {
    method: 'GET',
    headers: { 'Referer': referer, 'Origin': referer.replace(/\/$/, ''), 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
    .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function(data) {
      if (!data || !data.sources || data.sources.length === 0) throw new Error('Vide');
      return data.sources;
    });
}

// API 2 : Cpasmal
function fetchCpasmal(apiBase, referer, tmdbId, mediaType, season, episode) {
  var url = mediaType === 'tv'
    ? apiBase + '/api/cpasmal/tv/' + tmdbId + '/' + (season || 1) + '/' + (episode || 1)
    : apiBase + '/api/cpasmal/movie/' + tmdbId;

  return fetch(url, {
    method: 'GET',
    headers: { 'Referer': referer, 'Origin': referer.replace(/\/$/, ''), 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
    .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function(data) {
      if (!data || !data.links) throw new Error('Vide');
      var sources = [];
      var langs = ['vf', 'vostfr'];
      langs.forEach(function(lang) {
        if (data.links[lang]) {
          data.links[lang].forEach(function(link) {
            sources.push({ url: link.url, name: 'Movix', player: link.server, lang: lang });
          });
        }
      });
      return sources;
    });
}

// API 3 : FStream
function fetchFstream(apiBase, referer, tmdbId, mediaType, season, episode) {
  var url = mediaType === 'tv'
    ? apiBase + '/api/fstream/tv/' + tmdbId + '/season/' + (season || 1)
    : apiBase + '/api/fstream/movie/' + tmdbId;

  return fetch(url, {
    method: 'GET',
    headers: { 'Referer': referer, 'Origin': referer.replace(/\/$/, ''), 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
    .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function(data) {
      if (!data || !data.episodes) throw new Error('Vide');
      var ep = String(episode || 1);
      var episodeData = data.episodes[ep];
      if (!episodeData) throw new Error('Épisode non trouvé');
      var sources = [];
      ['VF', 'VOSTFR'].forEach(function(lang) {
        if (episodeData.languages[lang]) {
          episodeData.languages[lang].forEach(function(source) {
            sources.push({ url: source.url, name: 'Movix', player: source.player, lang: lang });
          });
        }
      });
      return sources;
    });
}

// API 4 : Darkino
function fetchDarkino(apiBase, referer, tmdbId, mediaType, season, episode) {
  var headers = {
    'Referer': referer,
    'Origin': referer.replace(/\/$/, ''),
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };
  var tmdbType = mediaType === 'tv' ? 'tv' : 'movie';

  return fetch('https://api.themoviedb.org/3/' + tmdbType + '/' + tmdbId + '?language=fr-FR&api_key=' + TMDB_KEY)
    .then(function(res) { if (!res.ok) throw new Error('TMDB ' + res.status); return res.json(); })
    .then(function(tmdb) {
      var title = tmdb.title || tmdb.name || tmdb.original_title || tmdb.original_name;
      if (!title) throw new Error('Titre TMDB introuvable');

      return fetch(apiBase + '/api/search?title=' + encodeURIComponent(title), { method: 'GET', headers: headers })
        .then(function(res) { if (!res.ok) throw new Error('Search ' + res.status); return res.json(); })
        .then(function(data) {
          var results = (data && data.results) ? data.results : [];
          var match = null;
          for (var i = 0; i < results.length; i++) {
            if (String(results[i].tmdb_id) === String(tmdbId) && results[i].have_streaming === 1) { match = results[i]; break; }
          }
          if (!match) {
            for (var j = 0; j < results.length; j++) {
              if (String(results[j].tmdb_id) === String(tmdbId)) { match = results[j]; break; }
            }
          }
          if (!match) throw new Error('tmdb_id ' + tmdbId + ' non trouvé');

          var downloadUrl = apiBase + '/api/films/download/' + match.id;
          if (mediaType === 'tv' && season && episode) downloadUrl += '?season=' + season + '&episode=' + episode;

          return fetch(downloadUrl, { method: 'GET', headers: headers })
            .then(function(res) { if (!res.ok) throw new Error('Download ' + res.status); return res.json(); })
            .then(function(data) {
              if (!data || !data.sources || data.sources.length === 0) throw new Error('Vide');
              return data.sources
                .filter(function(s) { return s.m3u8 && s.m3u8.includes('.m3u8'); })
                .map(function(s) {
                  return {
                    name: 'Movix',
                    title: buildTitle('Nightflix', s.quality || 'HD', s.language || 'MULTI', 'm3u8', s.size || ''),
                    url: s.m3u8,
                    quality: s.quality || 'HD',
                    format: 'm3u8',
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                      'Referer': 'https://darkibox.com/'
                    }
                  };
                });
            });
        });
    });
}

var UNSUPPORTED_PLAYERS = ['netu', 'voe', 'uqload', 'doodstream', 'vidoza', 'younetu', 'bysebuho', 'kakaflix', 'ralphy'];

function processEmbedSources(sources, referer) {
  var supportedSources = sources.filter(function(source) {
    var urlLower = source.url.toLowerCase();
    return !UNSUPPORTED_PLAYERS.some(function(player) { return urlLower.indexOf(player) !== -1; });
  });

  if (supportedSources.length === 0) return Promise.resolve([]);

  return Promise.all(supportedSources.slice(0, 8).map(function(source) {
    return resolveEmbed(source.url, referer).then(function(directUrl) {
      if (!directUrl || (!directUrl.match(/\.m3u8/i) && !directUrl.match(/\.mp4/i))) return null;
      var fmt = directUrl.match(/\.mp4/i) ? 'mp4' : 'm3u8';
      return {
        name: 'Movix',
        title: buildTitle(source.name, 'HD', source.lang, fmt, '', source.player),
        url: directUrl,
        quality: 'HD',
        format: fmt,
        headers: { 'Referer': referer, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      };
    });
  })).then(function(results) {
    return results.filter(function(r) { return r !== null; });
  });
}
function tryFetchAll(apiBase, referer, tmdbId, mediaType, season, episode) {
  return fetchPurstream(apiBase, referer, tmdbId, mediaType, season, episode)
    .then(function(sources) {
      return Promise.all(sources.map(function(source) {
        return resolveRedirect(source.url, referer).then(function(resolvedUrl) {
          var qual = source.name && source.name.indexOf('1080') !== -1 ? '1080p' : '720p';
          
          // CRITICAL FIX: Use source.name here so buildTitle can see "MULTI"
          return {
            name: 'Movix',
            title: buildTitle('Movix', qual, source.name, source.format || 'm3u8'), 
            url: resolvedUrl,
            quality: qual,
            format: source.format || 'm3u8',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          };
        });
      }));
    })
    .catch(function() {
      // Fallback logic for other APIs...
      return Promise.all([
        fetchCpasmal(apiBase, referer, tmdbId, mediaType, season, episode).catch(function() { return []; }),
        fetchFstream(apiBase, referer, tmdbId, mediaType, season, episode).catch(function() { return []; }),
        fetchDarkino(apiBase, referer, tmdbId, mediaType, season, episode).catch(function() { return []; })
      ]).then(function(results) {
        var embedSources = results[0].concat(results[1]);
        var darkinoSources = results[2];
        return processEmbedSources(embedSources, referer).then(function(resolved) {
          return darkinoSources.concat(resolved);
        });
      });
    });
}
function getMovieTitle(tmdbId, type) {
  var url = 'https://api.themoviedb.org/3/' + (type === 'tv' ? 'tv' : 'movie') + '/' + tmdbId + '?api_key=' + TMDB_KEY + '&language=en-US';
  return fetch(url)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      return data.title || data.name || "Movix"; // Fallback to Movix if name fails
    })
    .catch(function() { return "Movix"; });
}
function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Movix] Fetching tmdbId=' + tmdbId);

  // 1. Get the real Movie Name first
  return getMovieTitle(tmdbId, mediaType)
    .then(function(movieName) {
      
      // 2. Detect the API domain
      return detectApi().then(function(endpoint) {
        if (!endpoint) throw new Error('Détection endpoint échouée');
        
        // 3. Fetch all streams
        return tryFetchAll(endpoint.api, endpoint.referer, tmdbId, mediaType, season, episode)
          .then(function(streams) {
            // 4. Replace "Movix" with the Movie Name in the titles
            return streams.map(function(s) {
              s.title = s.title.replace('Movix', movieName);
              return s;
            });
          });
      });
    })
    .catch(function(err) {
      return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
