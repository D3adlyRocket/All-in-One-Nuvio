/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                       NetMirror — Nuvio Stream Plugin                       ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Source     › https://net22.cc  /  https://net52.cc                         ║
 * ║  Author     › Sanchit  |  TG: @S4NCHITT                                     ║
 * ║  Project    › Murph's Streams                                                ║
 * ║  Manifest   › https://badboysxs-morpheus.hf.space/manifest.json             ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Platforms  › Netflix · Prime Video · Disney+                                ║
 * ║  Supports   › Movies & Series  (480p / 720p / 1080p / Auto)                 ║
 * ║  Info       › Language list, quality & episode metadata from API             ║
 * ║  Parallel   › Multi-platform search & stream resolution                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const TMDB_API_KEY    = '439c478a771f35c05022f9feabcca01c';
const NETMIRROR_BASE  = 'https://net22.cc';
const NETMIRROR_PLAY  = 'https://net52.cc';
const PLUGIN_TAG      = '[NetMirror]';

// Cookie cache — bypass only when expired (15-minute window)
const COOKIE_EXPIRY_MS = 15 * 60 * 1000;
let   _cachedCookie    = '';
let   _cookieTimestamp = 0;

// Platform routing
const PLATFORM_OTT = {
  netflix    : 'nf',
  primevideo : 'pv',
  disney     : 'hs',
};

const PLATFORM_LABEL = {
  netflix    : 'Netflix',
  primevideo : 'Prime Video',
  disney     : 'Disney+',
};

const SEARCH_ENDPOINT = {
  netflix    : NETMIRROR_BASE + '/search.php',
  primevideo : NETMIRROR_BASE + '/pv/search.php',
  disney     : NETMIRROR_BASE + '/mobile/hs/search.php',
};

const EPISODES_ENDPOINT = {
  netflix    : NETMIRROR_BASE + '/episodes.php',
  primevideo : NETMIRROR_BASE + '/pv/episodes.php',
  disney     : NETMIRROR_BASE + '/mobile/hs/episodes.php',
};

const POST_ENDPOINT = {
  netflix    : NETMIRROR_BASE + '/post.php',
  primevideo : NETMIRROR_BASE + '/pv/post.php',
  disney     : NETMIRROR_BASE + '/mobile/hs/post.php',
};

const PLAYLIST_ENDPOINT = {
  netflix    : NETMIRROR_PLAY + '/playlist.php',
  primevideo : NETMIRROR_PLAY + '/pv/playlist.php',
  disney     : NETMIRROR_PLAY + '/mobile/hs/playlist.php',
};

const BASE_HEADERS = {
  'User-Agent'       : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept'           : 'application/json, text/plain, */*',
  'Accept-Language'  : 'en-US,en;q=0.9',
  'X-Requested-With' : 'XMLHttpRequest',
  'Connection'       : 'keep-alive',
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility Helpers
// ─────────────────────────────────────────────────────────────────────────────

function unixNow() {
  return Math.floor(Date.now() / 1000);
}

function makeCookieString(obj) {
  return Object.entries(obj).map(function (kv) { return kv[0] + '=' + kv[1]; }).join('; ');
}

/**
 * Fetch wrapper — rejects on non-2xx status.
 */
function request(url, opts) {
  opts = opts || {};
  return fetch(url, Object.assign({ redirect: 'follow' }, opts, {
    headers: Object.assign({}, BASE_HEADERS, opts.headers || {}),
  })).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    return res;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Language Code → Human Name Map
// Sourced from the actual API `lang` array format (ISO 639-2 codes)
// ─────────────────────────────────────────────────────────────────────────────

var LANG_CODE_MAP = {
  ces : 'Czech',    cze : 'Czech',
  deu : 'German',   ger : 'German',
  eng : 'English',
  spa : 'Spanish',
  fra : 'French',   fre : 'French',
  hin : 'Hindi',
  hun : 'Hungarian',
  ita : 'Italian',
  jpn : 'Japanese',
  pol : 'Polish',
  por : 'Portuguese',
  tur : 'Turkish',
  ukr : 'Ukrainian',
  kor : 'Korean',
  zho : 'Chinese',  chi : 'Chinese',
  ara : 'Arabic',
  rus : 'Russian',
  tam : 'Tamil',
  tel : 'Telugu',
  mal : 'Malayalam',
  ben : 'Bengali',
  mar : 'Marathi',
  pan : 'Punjabi',  pun : 'Punjabi',
  tha : 'Thai',
  vie : 'Vietnamese',
  ind : 'Indonesian',
  msa : 'Malay',
  nld : 'Dutch',
  swe : 'Swedish',
  nor : 'Norwegian',
  dan : 'Danish',
  fin : 'Finnish',
  ron : 'Romanian',
  bul : 'Bulgarian',
  hrv : 'Croatian',
  slk : 'Slovak',
  srp : 'Serbian',
  heb : 'Hebrew',
};

/**
 * Resolve a raw lang array from the API into a clean readable list.
 * API format: [{ l: "English", s: "eng" }, ...]
 * De-duplicates by label name.
 */
function parseLangArray(langs) {
  if (!Array.isArray(langs) || !langs.length) return [];
  var seen = {};
  var result = [];
  langs.forEach(function (entry) {
    var label = entry.l || LANG_CODE_MAP[(entry.s || '').toLowerCase()] || null;
    if (label && !seen[label]) {
      seen[label] = true;
      result.push(label);
    }
  });
  return result;
}

/**
 * Build a compact language string, capped to the first 5 languages to avoid
 * overwhelming the stream title.
 */
function formatLangs(langs) {
  if (!langs || !langs.length) return null;
  var shown = langs.slice(0, 5);
  var suffix = langs.length > 5 ? ' +' + (langs.length - 5) + ' more' : '';
  return shown.join(' · ') + suffix;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quality Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive a clean quality label from a source object or its URL.
 */
function parseQuality(source) {
  if (source.quality) {
    var m = (source.quality + '').match(/(\d{3,4}p)/i);
    if (m) return m[1].toLowerCase();
    var q = source.quality.toLowerCase();
    if (q.includes('1080') || q.includes('full hd') || q.includes('fhd')) return '1080p';
    if (q.includes('720')  || q === 'hd')  return '720p';
    if (q.includes('480'))                  return '480p';
    if (q.includes('360'))                  return '360p';
    if (q === 'auto')                       return 'Auto';
    return source.quality;
  }
  var url = source.url || source.file || '';
  if (url.includes('1080')) return '1080p';
  if (url.includes('720'))  return '720p';
  if (url.includes('480'))  return '480p';
  if (url.includes('360'))  return '360p';
  return 'Auto';
}

function qualitySortScore(q) {
  if (!q) return 0;
  var m = q.match(/(\d+)p/i);
  if (m) return parseInt(m[1]);
  if (q.toLowerCase() === 'auto') return 9999; // auto floats to top
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Authentication Bypass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Obtain (and cache) the t_hash_t authentication cookie.
 * Retries up to 5 times if the response check fails.
 */
function bypass() {
  var now = Date.now();
  if (_cachedCookie && (now - _cookieTimestamp) < COOKIE_EXPIRY_MS) {
    console.log(PLUGIN_TAG + ' Using cached auth cookie.');
    return Promise.resolve(_cachedCookie);
  }

  console.log(PLUGIN_TAG + ' Bypassing authentication…');

  function attempt(n) {
    if (n >= 5) return Promise.reject(new Error('Bypass failed after 5 attempts'));

    return request(NETMIRROR_PLAY + '/tv/p.php', { method: 'POST' })
      .then(function (res) {
        // Extract cookie from Set-Cookie header
        var setCookie = res.headers.get('set-cookie') || '';
        var cookieMatch = setCookie.match(/t_hash_t=([^;,\s]+)/);
        var extracted = cookieMatch ? cookieMatch[1] : null;

        return res.text().then(function (body) {
          if (!body.includes('"r":"n"')) {
            console.log(PLUGIN_TAG + ' Bypass attempt ' + (n + 1) + ' failed, retrying…');
            return attempt(n + 1);
          }
          if (!extracted) throw new Error('Cookie not found in response');
          _cachedCookie    = extracted;
          _cookieTimestamp = Date.now();
          console.log(PLUGIN_TAG + ' Auth successful.');
          return _cachedCookie;
        });
      });
  }

  return attempt(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// TMDB Lookup
// ─────────────────────────────────────────────────────────────────────────────

function getTmdbDetails(tmdbId, type) {
  var isTv  = (type === 'tv' || type === 'series');
  var url   = 'https://api.themoviedb.org/3/' + (isTv ? 'tv' : 'movie') + '/' + tmdbId + '?api_key=' + TMDB_API_KEY;
  console.log(PLUGIN_TAG + ' TMDB → ' + url);

  return fetch(url)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      return {
        title : isTv ? data.name  : data.title,
        year  : isTv ? (data.first_air_date || '').slice(0, 4) : (data.release_date || '').slice(0, 4),
        isTv  : isTv,
      };
    })
    .catch(function (err) {
      console.log(PLUGIN_TAG + ' TMDB error: ' + err.message);
      return null;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Search & Content Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Title similarity — returns 0–1 score.
 * Exact match = 1, all words present = 0.95, starts-with = 0.9.
 */
function similarity(a, b) {
  var s1 = a.toLowerCase().trim();
  var s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;
  if (s1.startsWith(s2) || s2.startsWith(s1)) return 0.9;
  var words1 = s1.split(/\s+/);
  var words2 = s2.split(/\s+/);
  var shorter = words1.length < words2.length ? words1 : words2;
  var longer  = words1.length < words2.length ? words2 : words1;
  var matched = shorter.filter(function (w) { return longer.indexOf(w) !== -1; }).length;
  return matched / longer.length;
}

/**
 * Search a single platform, filter results by title relevance, return the
 * best matching result or null.
 */
function searchPlatform(title, year, platform, cookie) {
  var ott    = PLATFORM_OTT[platform];
  var jar    = makeCookieString({ t_hash_t: cookie, user_token: '233123f803cf02184bf6c67e149cdd50', hd: 'on', ott: ott });
  var hdrs   = Object.assign({}, BASE_HEADERS, { Cookie: jar, Referer: NETMIRROR_BASE + '/tv/home' });

  function doSearch(query) {
    var url = SEARCH_ENDPOINT[platform] + '?s=' + encodeURIComponent(query) + '&t=' + unixNow();
    return request(url, { headers: hdrs })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var results = (data.searchResult || []).map(function (item) {
          return { id: item.id, title: item.t };
        });

        // Filter by similarity threshold
        var filtered = results
          .map(function (r) { return Object.assign({}, r, { score: similarity(r.title, title) }); })
          .filter(function (r) { return r.score >= 0.7; })
          .sort(function (a, b) { return b.score - a.score; });

        return filtered.length ? filtered[0] : null;
      });
  }

  // Try without year first, then with year as fallback
  return doSearch(title).then(function (hit) {
    if (hit) return hit;
    if (year) return doSearch(title + ' ' + year);
    return null;
  });
}

/**
 * Load full content details (episodes, seasons, audio tracks) from the API.
 */
function loadContent(contentId, platform, cookie) {
  var ott  = PLATFORM_OTT[platform];
  var jar  = makeCookieString({ t_hash_t: cookie, user_token: '233123f803cf02184bf6c67e149cdd50', ott: ott, hd: 'on' });
  var hdrs = Object.assign({}, BASE_HEADERS, { Cookie: jar, Referer: NETMIRROR_BASE + '/tv/home' });
  var url  = POST_ENDPOINT[platform] + '?id=' + contentId + '&t=' + unixNow();

  return request(url, { headers: hdrs })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      console.log(PLUGIN_TAG + ' Loaded: "' + data.title + '"');
      return {
        id       : contentId,
        title    : data.title,
        year     : data.year,
        episodes : (data.episodes || []).filter(Boolean),
        seasons  : data.season  || [],
        langs    : parseLangArray(data.lang || []),
        runtime  : data.runtime || null,
        isMovie  : !data.episodes || !data.episodes[0],
        // Pass raw for pagination
        _raw     : data,
      };
    });
}

/**
 * Fetch extra episode pages if `nextPageShow === 1`.
 */
function fetchMoreEpisodes(contentId, seasonId, platform, cookie, startPage) {
  var ott  = PLATFORM_OTT[platform];
  var jar  = makeCookieString({ t_hash_t: cookie, user_token: '233123f803cf02184bf6c67e149cdd50', ott: ott, hd: 'on' });
  var hdrs = Object.assign({}, BASE_HEADERS, { Cookie: jar, Referer: NETMIRROR_BASE + '/tv/home' });
  var url  = EPISODES_ENDPOINT[platform];
  var collected = [];

  function page(n) {
    return request(url + '?s=' + seasonId + '&series=' + contentId + '&t=' + unixNow() + '&page=' + n, { headers: hdrs })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.episodes) collected = collected.concat(data.episodes.filter(Boolean));
        if (data.nextPageShow === 0) return collected;
        return page(n + 1);
      })
      .catch(function () { return collected; });
  }

  return page(startPage || 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Video Token + Streaming Links
// ─────────────────────────────────────────────────────────────────────────────

function getVideoToken(contentId, cookie, ott) {
  var jar = makeCookieString({ t_hash_t: cookie, ott: ott || 'nf', hd: 'on' });

  // Step 1: POST to play.php to get `h` parameter
  return request(NETMIRROR_BASE + '/play.php', {
    method  : 'POST',
    headers : {
      'Content-Type'     : 'application/x-www-form-urlencoded',
      'X-Requested-With' : 'XMLHttpRequest',
      'Referer'          : NETMIRROR_BASE + '/',
      'Cookie'           : jar,
    },
    body: 'id=' + contentId,
  })
    .then(function (res) { return res.json(); })
    .then(function (playData) {
      var h = playData.h;

      // Step 2: GET play.php on PLAY domain to get the token
      return request(NETMIRROR_PLAY + '/play.php?id=' + contentId + '&' + h, {
        headers: {
          'Accept'         : 'text/html,application/xhtml+xml,*/*;q=0.9',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer'        : NETMIRROR_BASE + '/',
          'Sec-Fetch-Dest' : 'iframe',
          'Sec-Fetch-Mode' : 'navigate',
          'Sec-Fetch-Site' : 'cross-site',
          'Cookie'         : jar,
          'User-Agent'     : BASE_HEADERS['User-Agent'],
        },
      });
    })
    .then(function (res) { return res.text(); })
    .then(function (html) {
      var m = html.match(/data-h="([^"]+)"/);
      return m ? m[1] : null;
    });
}

/**
 * Fetch the actual HLS playlist and return source + subtitle arrays.
 */
function getPlaylist(contentId, title, platform, cookie, token) {
  var ott = PLATFORM_OTT[platform];
  var jar = makeCookieString({ t_hash_t: cookie, ott: ott, hd: 'on' });

  var url = PLAYLIST_ENDPOINT[platform]
    + '?id='  + contentId
    + '&t='   + encodeURIComponent(title)
    + '&tm='  + unixNow()
    + '&h='   + encodeURIComponent(token);

  return request(url, {
    headers: Object.assign({}, BASE_HEADERS, { Cookie: jar, Referer: NETMIRROR_PLAY + '/' }),
  })
    .then(function (res) { return res.json(); })
    .then(function (playlist) {
      if (!Array.isArray(playlist) || !playlist.length) return { sources: [], subtitles: [] };

      var sources   = [];
      var subtitles = [];

      playlist.forEach(function (item) {
        // Sources
        (item.sources || []).forEach(function (src) {
          var rawUrl = (src.file || '').replace(/^\/tv\//, '/');
          if (rawUrl && !rawUrl.startsWith('http')) rawUrl = NETMIRROR_PLAY + (rawUrl.startsWith('/') ? '' : '/') + rawUrl;
          if (rawUrl) sources.push({ url: rawUrl, quality: src.label || '', type: src.type || 'application/x-mpegURL' });
        });

        // Subtitles
        (item.tracks || []).filter(function (t) { return t.kind === 'captions'; }).forEach(function (track) {
          var subUrl = track.file || '';
          if (subUrl.startsWith('//')) subUrl = 'https:' + subUrl;
          else if (subUrl.startsWith('/')) subUrl = NETMIRROR_PLAY + subUrl;
          if (subUrl) subtitles.push({ url: subUrl, language: track.label || 'Unknown' });
        });
      });

      console.log(PLUGIN_TAG + ' Playlist: ' + sources.length + ' source(s), ' + subtitles.length + ' subtitle(s).');
      return { sources: sources, subtitles: subtitles };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Episode Matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find a specific episode object from the episodes array.
 * Handles both "S8"/"E3" format and plain number properties.
 */
function findEpisode(episodes, targetSeason, targetEpisode) {
  var s = parseInt(targetSeason);
  var e = parseInt(targetEpisode);

  return (episodes || []).find(function (ep) {
    if (!ep) return false;
    var epS, epE;

    if (ep.s && ep.ep) {
      // Format: { s: "S8", ep: "1" } — note ep is numeric string, not "E1"
      epS = parseInt((ep.s + '').replace(/\D/g, ''));
      epE = parseInt((ep.ep + '').replace(/\D/g, ''));
    } else if (ep.season !== undefined && ep.episode !== undefined) {
      epS = parseInt(ep.season);
      epE = parseInt(ep.episode);
    } else if (ep.season_number !== undefined && ep.episode_number !== undefined) {
      epS = parseInt(ep.season_number);
      epE = parseInt(ep.episode_number);
    } else {
      return false;
    }

    return epS === s && epE === e;
  }) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream Builder
// Assembles the final Nuvio stream object with full metadata branding.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a fully-labelled Nuvio stream object.
 *
 * Stream name (picker row):
 *   📺 Netflix | 1080p
 *
 * Stream title (detail lines):
 *   Formula 1: Drive to Survive (2019)
 *   📺 1080p · HLS
 *   🔊 English · Hindi · Spanish +9 more
 *   🗓 8 Seasons  |  💾 HLS
 *   by Sanchit · @S4NCHITT · Murph's Streams
 */
function buildStream(source, platform, tmdb, content, episodeData, langList) {
  var quality    = parseQuality(source);
  var platLabel  = PLATFORM_LABEL[platform] || platform;
  var langStr    = formatLangs(langList);

  // ── Name (picker) ──────────────────────────────────────────────────────────
  var streamName = '📺 ' + platLabel + ' | ' + quality;

  // ── Title (details) ────────────────────────────────────────────────────────
  var lines = [];

  // Line 1: content title + year
  var titleLine = (tmdb.title || content.title);
  if (tmdb.year || content.year) titleLine += ' (' + (tmdb.year || content.year) + ')';
  if (tmdb.isTv && episodeData) {
    var epNum = (episodeData.ep || episodeData.episode || episodeData.episode_number || '');
    var sNum  = (episodeData.s  || episodeData.season  || episodeData.season_number  || '');
    var sClean = String(sNum).replace(/\D/g, '');
    var eClean = String(epNum).replace(/\D/g, '');
    titleLine += ' · S' + sClean + 'E' + eClean;
    if (episodeData.t) titleLine += ' — ' + episodeData.t;
  }
  lines.push(titleLine);

  // Line 2: quality
  lines.push('📺 ' + quality + ' · HLS');

  // Line 3: languages
  if (langStr) lines.push('🔊 ' + langStr);

  // Line 4: runtime / seasons
  if (content.runtime) lines.push('🗓 ' + content.runtime);

  // Subtitle list (compact)
  // (subtitles are passed separately via subtitleTracks)

  // Attribution
  lines.push("by Sanchit · @S4NCHITT · Murph's Streams");

  return {
    name    : streamName,
    title   : lines.join('\n'),
    url     : source.url,
    quality : quality,
    type    : 'hls',
    headers : {
      'User-Agent'      : 'Mozilla/5.0 (Android) ExoPlayer',
      'Accept'          : '*/*',
      'Accept-Encoding' : 'identity',
      'Connection'      : 'keep-alive',
      'Cookie'          : 'hd=on',
      'Referer'         : NETMIRROR_PLAY + '/',
    },
    behaviorHints: {
      bingeGroup : 'netmirror-' + platform,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform Pipeline
// Search → Load → Match episode → Token → Playlist → Build streams
// ─────────────────────────────────────────────────────────────────────────────

function tryPlatform(platform, tmdb, season, episode, cookie) {
  console.log(PLUGIN_TAG + ' Trying platform: ' + PLATFORM_LABEL[platform]);

  return searchPlatform(tmdb.title, tmdb.year, platform, cookie)
    .then(function (hit) {
      if (!hit) {
        console.log(PLUGIN_TAG + ' Not found on ' + PLATFORM_LABEL[platform]);
        return null;
      }
      console.log(PLUGIN_TAG + ' Match: "' + hit.title + '" (ID: ' + hit.id + ') score=' + hit.score.toFixed(2));

      return loadContent(hit.id, platform, cookie).then(function (content) {
        // ── Pagination: fetch remaining episodes if needed ───────────────────
        var raw     = content._raw;
        var epChain = Promise.resolve();

        if (raw.nextPageShow === 1 && raw.nextPageSeason) {
          epChain = epChain.then(function () {
            return fetchMoreEpisodes(hit.id, raw.nextPageSeason, platform, cookie, 2)
              .then(function (more) { content.episodes = content.episodes.concat(more); });
          });
        }

        // Other seasons (all except the last one already in the response)
        if (Array.isArray(raw.season) && raw.season.length > 1) {
          raw.season.slice(0, -1).forEach(function (s) {
            epChain = epChain.then(function () {
              return fetchMoreEpisodes(hit.id, s.id, platform, cookie, 1)
                .then(function (more) { content.episodes = content.episodes.concat(more); });
            });
          });
        }

        return epChain.then(function () {
          // ── Determine the target content ID ─────────────────────────────────
          var targetId   = hit.id;
          var episodeObj = null;

          if (tmdb.isTv) {
            episodeObj = findEpisode(content.episodes, season || 1, episode || 1);
            if (!episodeObj) {
              console.log(PLUGIN_TAG + ' S' + season + 'E' + episode + ' not found on ' + PLATFORM_LABEL[platform]);
              return null;
            }
            targetId = episodeObj.id;
            console.log(PLUGIN_TAG + ' Episode ID: ' + targetId);
          }

          // ── Get video token ──────────────────────────────────────────────────
          return getVideoToken(targetId, cookie, PLATFORM_OTT[platform])
            .then(function (token) {
              if (!token) {
                console.log(PLUGIN_TAG + ' Could not get video token');
                return null;
              }

              // ── Fetch playlist ─────────────────────────────────────────────
              return getPlaylist(targetId, tmdb.title, platform, cookie, token)
                .then(function (playlist) {
                  if (!playlist.sources.length) {
                    console.log(PLUGIN_TAG + ' No sources in playlist');
                    return null;
                  }

                  // ── Build and sort streams ─────────────────────────────────
                  var streams = playlist.sources
                    .map(function (src) {
                      return buildStream(src, platform, tmdb, content, episodeObj, content.langs);
                    })
                    .sort(function (a, b) {
                      return qualitySortScore(b.quality) - qualitySortScore(a.quality);
                    });

                  console.log(PLUGIN_TAG + ' ✔ ' + streams.length + ' stream(s) from ' + PLATFORM_LABEL[platform]);
                  return streams;
                });
            });
        });
      });
    })
    .catch(function (err) {
      console.log(PLUGIN_TAG + ' Error on ' + PLATFORM_LABEL[platform] + ': ' + err.message);
      return null;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — getStreams
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point called by the Nuvio plugin runner.
 *
 * @param {string}        tmdbId   - TMDB content ID
 * @param {string}        type     - "movie" | "tv" | "series"
 * @param {number|string} season   - Season number  (TV only)
 * @param {number|string} episode  - Episode number (TV only)
 * @returns {Promise<Array>}         Array of Nuvio-compatible stream objects
 */
function getStreams(tmdbId, type, season, episode) {
  var mediaType = (type === 'series') ? 'tv' : (type || 'movie');
  var s         = season  ? parseInt(season)  : null;
  var e         = episode ? parseInt(episode) : null;

  console.log(PLUGIN_TAG + ' ► TMDB: ' + tmdbId + ' | type: ' + mediaType + (s ? ' S' + s + 'E' + e : ''));

  return getTmdbDetails(tmdbId, mediaType)
    .then(function (tmdb) {
      if (!tmdb || !tmdb.title) {
        console.log(PLUGIN_TAG + ' TMDB lookup failed.');
        return [];
      }

      console.log(PLUGIN_TAG + ' Title: "' + tmdb.title + '" (' + tmdb.year + ')');

      return bypass().then(function (cookie) {

        // Platform order — bias toward likely platform based on title keywords
        var platforms = ['netflix', 'primevideo', 'disney'];
        var t = tmdb.title.toLowerCase();
        if (t.includes('prime') || t.includes('boys') || t.includes('jack ryan')) {
          platforms = ['primevideo', 'netflix', 'disney'];
        } else if (t.includes('star wars') || t.includes('marvel') || t.includes('mandalorian') || t.includes('pixar')) {
          platforms = ['disney', 'netflix', 'primevideo'];
        }

        // Try platforms sequentially — return first successful result
        function tryNext(i) {
          if (i >= platforms.length) {
            console.log(PLUGIN_TAG + ' No streams found on any platform.');
            return [];
          }
          return tryPlatform(platforms[i], tmdb, s, e, cookie)
            .then(function (streams) {
              if (streams && streams.length) return streams;
              return tryNext(i + 1);
            });
        }

        return tryNext(0);
      });
    })
    .catch(function (err) {
      console.error(PLUGIN_TAG + ' Fatal error: ' + err.message);
      return [];
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}