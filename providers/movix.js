// =============================================================
// Provider Nuvio : Movix.llc (VF/VOSTFR français)
// Version : 4.2.1 - Triple API (purstream + cpasmal + fstream)
//           + Darkino (Nightflix/darkibox) en bonus
//           + Auto-détection URL via movix.health
// =============================================================

var MOVIX_API = 'https://api.movix.llc';
var MOVIX_REFERER = 'https://movix.llc/';
var MOVIX_HEALTH_URL = 'https://movix.health/';
var TMDB_KEY = 'f3d757824f08ea2cff45eb8f47ca3a1e';

// Détecte l'URL active depuis movix.health (page de redirection officielle)
function detectApiFromHealth() {
  return fetch(MOVIX_HEALTH_URL, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
    .then(function(res) {
      var finalUrl = res.url || MOVIX_REFERER;
      return res.text().then(function(html) {
        var canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
        var ogUrl = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
        var frontendUrl = (canonical && canonical[1]) || (ogUrl && ogUrl[1]) || null;

        if (!frontendUrl) {
          var matches = html.match(/https?:\/\/movix\.[a-z]+/gi);
          if (matches) {
            var candidates = matches.filter(function(url) {
              return !url.includes('health') && !url.includes('t.me') && !url.includes('telegram');
            });
            if (candidates.length > 0) frontendUrl = candidates[candidates.length - 1];
          }
        }

        if (!frontendUrl && finalUrl && finalUrl.includes('movix.')) {
          frontendUrl = finalUrl.replace(/\/$/, '');
        }

        if (!frontendUrl) return null;

        frontendUrl = frontendUrl.replace(/\/$/, '');
        var tld = frontendUrl.replace(/https?:\/\/movix\./, '');
        console.log('[Movix] URL détectée via movix.health: movix.' + tld);
        return {
          api: 'https://api.movix.' + tld,
          referer: 'https://movix.' + tld + '/'
        };
      });
    })
    .catch(function() { return null; });
}

// Fallback : détection via Telegram
function detectApiFromTelegram() {
  var TELEGRAM_CHANNEL = 'https://t.me/s/movix_site';
  return fetch(TELEGRAM_CHANNEL, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var matches = html.match(/https?:\/\/movix\.[a-z]+/gi);
      if (!matches) return null;
      var frontendDomains = matches.filter(function(url) {
        return !url.includes('t.me') && !url.includes('noel.') && !url.includes('telegram') && !url.includes('health');
      });
      if (frontendDomains.length === 0) return null;
      var lastFrontend = frontendDomains[frontendDomains.length - 1];
      var tld = lastFrontend.replace(/https?:\/\/movix\./, '');
      return { api: 'https://api.movix.' + tld, referer: lastFrontend + '/' };
    })
    .catch(function() { return null; });
}

// Détection combinée : movix.health en priorité, Telegram en fallback
function detectApi() {
  return detectApiFromHealth().then(function(result) {
    if (result) return result;
    console.log('[Movix] movix.health sans résultat, tentative Telegram...');
    return detectApiFromTelegram();
  });
}

function resolveRedirect(url, referer) {
  return fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': referer || MOVIX_REFERER
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
      'Referer': referer || MOVIX_REFERER
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

// API 1 : Purstream — m3u8 direct
function fetchPurstream(apiBase, referer, tmdbId, mediaType, season, episode) {
  var url = mediaType === 'tv'
    ? apiBase + '/api/purstream/tv/' + tmdbId + '/stream?season=' + (season || 1) + '&episode=' + (episode || 1)
    : apiBase + '/api/purstream/movie/' + tmdbId + '/stream';

  console.log('[Movix] Purstream: ' + url);
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

// API 2 : Cpasmal — voe, netu, doodstream, vidoza (VF/VOSTFR)
function fetchCpasmal(apiBase, referer, tmdbId, mediaType, season, episode) {
  var url = mediaType === 'tv'
    ? apiBase + '/api/cpasmal/tv/' + tmdbId + '/' + (season || 1) + '/' + (episode || 1)
    : apiBase + '/api/cpasmal/movie/' + tmdbId;

  console.log('[Movix] Cpasmal: ' + url);
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
            sources.push({
              url: link.url,
              name: 'Movix ' + lang.toUpperCase(),
              player: link.server,
              lang: lang
            });
          });
        }
      });
      if (sources.length === 0) throw new Error('Aucune source');
      return sources;
    });
}

// API 3 : FStream — vidzy, fsvid, uqload (VF/VOSTFR)
function fetchFstream(apiBase, referer, tmdbId, mediaType, season, episode) {
  var url = mediaType === 'tv'
    ? apiBase + '/api/fstream/tv/' + tmdbId + '/season/' + (season || 1)
    : apiBase + '/api/fstream/movie/' + tmdbId;

  console.log('[Movix] FStream: ' + url);
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
            sources.push({ url: source.url, name: 'Movix FStream ' + lang, player: source.player, lang: lang });
          });
        }
      });
      if (sources.length === 0) throw new Error('Aucune source');
      return sources;
    });
}

// API 4 : Darkino (Nightflix) — m3u8 directs haute qualité via darkibox
// Étape 1 : titre via TMDB → Étape 2 : ID interne via /api/search → Étape 3 : /api/films/download
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
      console.log('[Movix] Darkino titre: "' + title + '"');

      return fetch(apiBase + '/api/search?title=' + encodeURIComponent(title), { method: 'GET', headers: headers })
        .then(function(res) { if (!res.ok) throw new Error('Search ' + res.status); return res.json(); })
        .then(function(data) {
          var results = (data && data.results) ? data.results : [];

          // Priorité 1 : tmdb_id exact + have_streaming=1
          var match = null;
          for (var i = 0; i < results.length; i++) {
            if (String(results[i].tmdb_id) === String(tmdbId) && results[i].have_streaming === 1) {
              match = results[i]; break;
            }
          }
          // Priorité 2 : tmdb_id exact sans filtre streaming
          if (!match) {
            for (var j = 0; j < results.length; j++) {
              if (String(results[j].tmdb_id) === String(tmdbId)) {
                match = results[j]; break;
              }
            }
          }
          if (!match) throw new Error('tmdb_id ' + tmdbId + ' non trouvé');
          console.log('[Movix] Darkino ID interne: ' + match.id);

          var downloadUrl = apiBase + '/api/films/download/' + match.id;
          if (mediaType === 'tv' && season && episode) {
            downloadUrl += '?season=' + season + '&episode=' + episode;
          }
          console.log('[Movix] Darkino download: ' + downloadUrl);

          return fetch(downloadUrl, { method: 'GET', headers: headers })
            .then(function(res) { if (!res.ok) throw new Error('Download ' + res.status); return res.json(); })
            .then(function(data) {
              if (!data || !data.sources || data.sources.length === 0) throw new Error('Vide');
              return data.sources
                .filter(function(s) { return s.m3u8 && s.m3u8.includes('.m3u8'); })
                .map(function(s) {
                  return {
                    name: 'Movix',
                    title: 'Nightflix ' + (s.quality || 'HD') + ' - ' + (s.language || 'MULTI'),
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

// Domaines qu'on ne peut pas résoudre (nécessitent cookies/JS)
var UNSUPPORTED_PLAYERS = ['netu', 'voe', 'uqload', 'doodstream', 'vidoza', 'younetu', 'bysebuho', 'kakaflix', 'ralphy'];

function processEmbedSources(sources, referer) {
  var supportedSources = sources.filter(function(source) {
    var urlLower = source.url.toLowerCase();
    return !UNSUPPORTED_PLAYERS.some(function(player) {
      return urlLower.indexOf(player) !== -1;
    });
  });

  if (supportedSources.length === 0) return Promise.resolve([]);

  return Promise.all(supportedSources.slice(0, 8).map(function(source) {
    return resolveEmbed(source.url, referer).then(function(directUrl) {
      if (!directUrl || (!directUrl.match(/\.m3u8/i) && !directUrl.match(/\.mp4/i))) return null;
      return {
        name: 'Movix',
        title: source.name + ' - ' + source.player,
        url: directUrl,
        quality: 'HD',
        format: directUrl.match(/\.mp4/i) ? 'mp4' : 'm3u8',
        headers: {
          'Referer': referer,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };
    });
  })).then(function(results) {
    return results.filter(function(r) { return r !== null; });
  });
}

function tryFetchAll(apiBase, referer, tmdbId, mediaType, season, episode) {
  // Étape 1 : Purstream (m3u8 direct) — identique à la v4.1.0
  return fetchPurstream(apiBase, referer, tmdbId, mediaType, season, episode)
    .then(function(sources) {
      return Promise.all(sources.map(function(source) {
        return resolveRedirect(source.url, referer).then(function(resolvedUrl) {
          return {
            name: 'Movix',
            title: source.name || 'Movix VF',
            url: resolvedUrl,
            quality: source.name && source.name.indexOf('1080') !== -1 ? '1080p' : '720p',
            format: source.format || 'm3u8',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          };
        });
      }));
    })
    .catch(function() {
      // Étape 2 : Cpasmal + FStream + Darkino en parallèle — identique à v4.1.0 + Darkino en bonus
      console.log('[Movix] Purstream vide, tentative Cpasmal + FStream + Darkino...');
      return Promise.all([
        fetchCpasmal(apiBase, referer, tmdbId, mediaType, season, episode).catch(function() { return []; }),
        fetchFstream(apiBase, referer, tmdbId, mediaType, season, episode).catch(function() { return []; }),
        fetchDarkino(apiBase, referer, tmdbId, mediaType, season, episode).catch(function(e) {
          console.log('[Movix] Darkino échec: ' + (e.message || e));
          return [];
        })
      ]).then(function(results) {
        var embedSources = results[0].concat(results[1]);
        var darkinoSources = results[2];

        // Darkino en premier (m3u8 directs), puis les embeds résolus
        return processEmbedSources(embedSources, referer).then(function(resolved) {
          var all = darkinoSources.concat(resolved);
          if (all.length === 0) throw new Error('Aucune source');
          return all;
        });
      });
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Movix] Fetching tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);

  var apiBase = MOVIX_API;
  var referer = MOVIX_REFERER;

  // Étape 1 : Essai avec l'API par défaut (movix.llc)
  return tryFetchAll(apiBase, referer, tmdbId, mediaType, season, episode)
    .catch(function() {
      // Étape 2 : Détection automatique via movix.health (puis Telegram en fallback)
      console.log('[Movix] API par défaut en échec, détection automatique...');
      return detectApi().then(function(detected) {
        if (!detected) return [];
        if (detected.api === apiBase) return [];
        console.log('[Movix] Nouvel endpoint détecté: ' + detected.api);
        return tryFetchAll(detected.api, detected.referer, tmdbId, mediaType, season, episode);
      });
    })
    .catch(function(err) {
      console.error('[Movix] Erreur globale:', err.message || err);
      return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
