/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                      MovieBox — Nuvio Stream Plugin                         ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Source     › https://themoviebox.org                                       ║
 * ║  Author     › Sanchit  |  TG: @S4NCHITT                                     ║
 * ║  Project    › Murph's Streams                                                ║
 * ║  Manifest   › https://badboysxs-morpheus.hf.space/manifest.json             ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Port       › Exact 1:1 of MovieBox Provider v4.0 (confirmed working)       ║
 * ║  Changes    › async/await → Promise chains  |  const/let → var              ║
 * ║             › AbortSignal removed (not available in all Nuvio runtimes)     ║
 * ║             › formatStreams() → Nuvio stream objects with behaviorHints      ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Constants — identical to v4.0
// ─────────────────────────────────────────────────────────────────────────────

var TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
var MB_BASE      = 'https://themoviebox.org';
var BROWSER_UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0';

var HTML_HEADERS = {
  'User-Agent'                : BROWSER_UA,
  'Accept'                    : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language'           : 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests' : '1',
};

var API_HEADERS = {
  'User-Agent'     : BROWSER_UA,
  'Accept'         : 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-Client-Info'  : JSON.stringify({ timezone: 'Asia/Kolkata' }),
  'Sec-Fetch-Dest' : 'empty',
  'Sec-Fetch-Mode' : 'cors',
  'Sec-Fetch-Site' : 'same-origin',
  'X-Source'       : '',
  'Pragma'         : 'no-cache',
  'Cache-Control'  : 'no-cache',
};

// Nuvio player sends these with every request for this stream (replaces proxy)
var STREAM_HEADERS = {
  'User-Agent'     : BROWSER_UA,
  'Referer'        : 'https://themoviebox.org/',
  'Origin'         : 'https://themoviebox.org',
  'Accept'         : '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection'     : 'keep-alive',
};

// ─────────────────────────────────────────────────────────────────────────────
// LRU Cache
// ─────────────────────────────────────────────────────────────────────────────

function Cache(max, ttl) {
  this.max = max; this.ttl = ttl; this.d = {}; this.ks = [];
}
Cache.prototype.get = function (k) {
  var e = this.d[k];
  if (!e) return undefined;
  if (Date.now() - e.t > this.ttl) { delete this.d[k]; return undefined; }
  return e.v;
};
Cache.prototype.set = function (k, v) {
  if (this.d[k]) { this.d[k] = { v: v, t: Date.now() }; return; }
  if (this.ks.length >= this.max) delete this.d[this.ks.shift()];
  this.ks.push(k);
  this.d[k] = { v: v, t: Date.now() };
};

var _streamCache = new Cache(200, 20 * 60 * 1000);
var _metaCache   = new Cache(500, 24 * 60 * 60 * 1000);
var _srchCache   = new Cache(300, 10 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// Nuxt SSR parser — identical to v4.0
// ─────────────────────────────────────────────────────────────────────────────

function extractNuxtData(html) {
  var idx = html.indexOf('__NUXT_DATA__');
  if (idx === -1) return null;
  var start = html.indexOf('[', idx);
  var end   = html.indexOf('</script>', idx);
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(html.substring(start, end)); }
  catch (e) { return null; }
}

function resolveNuxt(data, idx, depth) {
  if (depth === undefined) depth = 0;
  if (depth > 15 || idx < 0 || idx >= data.length) return null;
  var item = data[idx];

  if (Array.isArray(item)) {
    if (item.length === 2 && (item[0] === 'ShallowReactive' || item[0] === 'Reactive')) {
      return resolveNuxt(data, item[1], depth + 1);
    }
    return item.map(function (v) {
      return typeof v === 'number' ? resolveNuxt(data, v, depth + 1) : v;
    });
  }

  if (item && typeof item === 'object') {
    var obj = {};
    var keys = Object.keys(item);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], v = item[k];
      obj[k] = typeof v === 'number' ? resolveNuxt(data, v, depth + 1) : v;
    }
    return obj;
  }

  return item;
}

// ─────────────────────────────────────────────────────────────────────────────
// search() — identical logic to v4.0, Promise chain
// ─────────────────────────────────────────────────────────────────────────────

function search(query) {
  var cached = _srchCache.get(query);
  if (cached) return Promise.resolve(cached);

  console.log('[MovieBox] Searching: "' + query + '"');

  var url = MB_BASE + '/newWeb/searchResult?keyword=' + encodeURIComponent(query);

  return fetch(url, { headers: HTML_HEADERS, redirect: 'follow' })
    .then(function (res) {
      if (!res.ok) throw new Error('Search HTTP ' + res.status);
      return res.text();
    })
    .then(function (html) {
      var data = extractNuxtData(html);
      if (!data) {
        console.log('[MovieBox] No Nuxt data found in search');
        return [];
      }

      // Find the { pager, items } object — same as v4.0
      var itemsIndices = null;
      for (var i = 0; i < data.length; i++) {
        var item = data[i];
        if (item && typeof item === 'object' && 'pager' in item && 'items' in item) {
          var ref = item.items;
          itemsIndices = typeof ref === 'number' ? data[ref] : ref;
          break;
        }
      }
      if (!itemsIndices || !Array.isArray(itemsIndices)) return [];

      var results = [];
      for (var j = 0; j < itemsIndices.length; j++) {
        var resolved = resolveNuxt(data, itemsIndices[j]);
        if (!resolved || typeof resolved !== 'object') continue;

        // Language priority order — identical to v4.0
        var language = resolved.language
          || resolved.lang
          || resolved.dubbed_lang
          || resolved.original_language
          || null;

        results.push({
          subject_id  : resolved.subjectId,
          title       : resolved.title || '',
          subject_type: resolved.subjectType,   // 1=TV  2=Movie
          detail_path : resolved.detailPath,
          release_date: resolved.releaseDate,
          language    : language,
        });
      }

      console.log('[MovieBox] Found ' + results.length + ' results');
      if (results.length) _srchCache.set(query, results);
      return results;
    })
    .catch(function (e) {
      console.log('[MovieBox] Search error "' + query + '": ' + e.message);
      return [];
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring helpers — identical to v4.0
// ─────────────────────────────────────────────────────────────────────────────

function normalizeTitle(str) {
  return (str || '')
    .toLowerCase()
    .replace(/\[.*?\]/g, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s*-\s*(part|volume|chapter|episode)\s*\d+/gi, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function score(result, targetTitle, targetYear) {
  var resultTitle = result.title || '';
  var resultYear  = (result.release_date || '').substring(0, 4);
  var normTarget  = normalizeTitle(targetTitle);
  var normResult  = normalizeTitle(resultTitle);

  if (!normTarget || !normResult) return 0;
  if (normResult === normTarget) return 90;
  if (normResult.indexOf(normTarget) !== -1 || normTarget.indexOf(normResult) !== -1) return 70;

  var wordsTarget = normTarget.split(' ').filter(function (w) { return w.length > 2; });
  var wordsResult = normResult.split(' ').filter(function (w) { return w.length > 2; });
  if (!wordsTarget.length || !wordsResult.length) return 0;

  var matches    = wordsTarget.filter(function (w) { return wordsResult.indexOf(w) !== -1; }).length;
  var titleScore = Math.round((matches / Math.max(wordsTarget.length, wordsResult.length)) * 50);

  if (targetYear && resultYear && targetYear === resultYear) titleScore += 30;
  return titleScore;
}

function isHindi(result) {
  return (result.language && result.language.toLowerCase().indexOf('hindi') !== -1) ||
         result.title.toLowerCase().indexOf('hindi') !== -1;
}

function hasHindiTag(title) {
  return (title || '').toLowerCase().indexOf('[hindi]') !== -1;
}

function getLanguageFromTitle(title) {
  var lower = (title || '').toLowerCase();
  if (lower.indexOf('[hindi]')    !== -1 || lower.indexOf('(hindi)')    !== -1 || lower.indexOf(' hindi ')    !== -1) return 'Hindi';
  if (lower.indexOf('[tamil]')    !== -1 || lower.indexOf('(tamil)')    !== -1 || lower.indexOf(' tamil ')    !== -1) return 'Tamil';
  if (lower.indexOf('[telugu]')   !== -1 || lower.indexOf('(telugu)')   !== -1 || lower.indexOf(' telugu ')   !== -1) return 'Telugu';
  if (lower.indexOf('[english]')  !== -1 || lower.indexOf('(english)')  !== -1 || lower.indexOf(' english ')  !== -1) return 'English';
  if (lower.indexOf('[original]') !== -1 || lower.indexOf('(original)') !== -1 || lower.indexOf(' original ') !== -1) return 'Original';
  return 'Original';
}

// ─────────────────────────────────────────────────────────────────────────────
// getStreamsRaw() — identical to v4.0, Promise chain
// ─────────────────────────────────────────────────────────────────────────────

function getStreamsRaw(subjectId, detailPath, se, ep) {
  if (se === undefined) se = '0';
  if (ep === undefined) ep = '0';

  var url = MB_BASE + '/wefeed-h5api-bff/subject/play'
    + '?subjectId='  + encodeURIComponent(subjectId)
    + '&se='         + String(se)
    + '&ep='         + String(ep)
    + '&detailPath=' + encodeURIComponent(detailPath);

  var headers = Object.assign({}, API_HEADERS, {
    'Referer': MB_BASE + '/movies/' + detailPath + '?id=' + subjectId + '&type=/movie/detail&detailSe=&detailEp=&lang=en'
  });

  return fetch(url, { headers: headers, redirect: 'follow' })
    .then(function (res) {
      if (!res.ok) throw new Error('Streams HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      if (data.code !== 0) throw new Error(data.message || 'API error');
      return data.data.streams || [];
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// pickBest() — identical logic to v4.0, Promise chain
// ALL initial queries fire in parallel
// ─────────────────────────────────────────────────────────────────────────────

function pickBest(title, year) {
  var initialQueries = [
    title + ' Hindi',
    year ? title + ' ' + year + ' Hindi' : null,
    title,
    year ? title + ' ' + year : null,
  ].filter(Boolean);

  console.log('[MovieBox] Parallel search: ' + initialQueries.map(function (q) { return '"' + q + '"'; }).join(', '));

  return Promise.all(initialQueries.map(function (q) {
    return search(q).catch(function () { return []; });
  }))
    .then(function (allResults) {
      var allValidResults = [];
      var allHindiResults = [];
      var bestNonHindi    = { result: null, score: 0 };

      for (var i = 0; i < allResults.length; i++) {
        var results = allResults[i];
        var valid   = results.filter(function (r) { return r.subject_type === 1 || r.subject_type === 2; });
        allValidResults = allValidResults.concat(valid);
        for (var j = 0; j < valid.length; j++) {
          var r = valid[j];
          if (!isHindi(r)) {
            var s = score(r, title, year);
            if (s > bestNonHindi.score) bestNonHindi = { result: r, score: s };
          }
        }
        var hindiValid = valid.filter(isHindi);
        allHindiResults = allHindiResults.concat(hindiValid);
      }

      // Exact-title Hindi retry — only if no Hindi found yet (same as v4.0)
      var hindiRetry = Promise.resolve();
      if (bestNonHindi.result && bestNonHindi.score >= 60 && allHindiResults.length === 0) {
        var exactHindiQuery = bestNonHindi.result.title + ' Hindi';
        console.log('[MovieBox] Fallback Hindi query: "' + exactHindiQuery + '"');
        hindiRetry = search(exactHindiQuery).catch(function () { return []; }).then(function (exactResults) {
          var validExact = exactResults.filter(function (r) { return r.subject_type === 1 || r.subject_type === 2; });
          allValidResults = allValidResults.concat(validExact);
          allHindiResults = allHindiResults.concat(validExact.filter(isHindi));
        });
      }

      return hindiRetry.then(function () {
        var picked        = null;
        var isHindiResult = false;

        // Pick best Hindi (threshold ≥ 20)
        if (allHindiResults.length > 0) {
          console.log('[MovieBox] Total Hindi candidates: ' + allHindiResults.length);
          var bestScore = 0;
          for (var i2 = 0; i2 < allHindiResults.length; i2++) {
            var r2 = allHindiResults[i2];
            var s2 = score(r2, title, year);
            console.log('[MovieBox] Hindi candidate: "' + r2.title + '" score=' + s2);
            if (s2 > bestScore) { bestScore = s2; picked = r2; }
          }
          if (picked && bestScore >= 20) {
            console.log('[MovieBox] Best Hindi match: "' + picked.title + '" score=' + bestScore);
            isHindiResult = true;
          } else {
            console.log('[MovieBox] Best Hindi score too low (' + bestScore + '), falling back');
            picked = null;
          }
        }

        // Fallback to best overall (threshold ≥ 30)
        if (!picked) {
          console.log('[MovieBox] No suitable Hindi result, falling back to best overall');
          var bestScore2 = 0;
          for (var i3 = 0; i3 < allValidResults.length; i3++) {
            var r3 = allValidResults[i3];
            var s3 = score(r3, title, year);
            console.log('[MovieBox] Overall candidate: "' + r3.title + '" score=' + s3);
            if (s3 > bestScore2) { bestScore2 = s3; picked = r3; }
          }
          if (picked && bestScore2 >= 30) {
            console.log('[MovieBox] Best overall match: "' + picked.title + '" score=' + bestScore2);
            isHindiResult = hasHindiTag(picked.title);
          } else {
            console.log('[MovieBox] No suitable result found');
            return { picked: null, isHindiResult: false };
          }
        }

        return { picked: picked, isHindiResult: isHindiResult };
      });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// formatStreams() — same sort + quality logic as v4.0, Nuvio output format
// ─────────────────────────────────────────────────────────────────────────────

function formatStreams(rawStreams, title, year, langLabel, mediaType, seasonNum, episodeNum) {
  // Sort descending by resolution — identical to v4.0
  var sorted = rawStreams.slice().sort(function (a, b) {
    return Number(b.resolutions || 0) - Number(a.resolutions || 0);
  });

  return sorted
    .filter(function (s) { return !!s.url; })
    .map(function (s) {
      // Quality label — identical to v4.0
      var resolution = s.resolutions || 'Auto';
      var quality;
      if (typeof resolution === 'number') {
        quality = resolution + 'p';
      } else if (typeof resolution === 'string') {
        var m = resolution.match(/(\d+)/);
        quality = m ? m[1] + 'p' : resolution;
      } else {
        quality = 'Auto';
      }

      // Episode suffix for TV — identical to v4.0
      var epSuffix = (mediaType === 'tv' && seasonNum != null && episodeNum != null)
        ? ' S' + String(seasonNum).padStart(2, '0') + 'E' + String(episodeNum).padStart(2, '0')
        : '';

      // ── Nuvio stream name + title lines ─────────────────────────────────
      var streamName = '📺 MovieBox | ' + quality + ' | ' + langLabel;

      var lines = [];
      lines.push(title + (year ? ' (' + year + ')' : '') + epSuffix);
      lines.push('📺 ' + quality + '  🔊 ' + langLabel + (s.codecName ? '  🎞 ' + s.codecName : ''));
      if (s.size) {
        var sizeMb = Math.round(Number(s.size) / 1024 / 1024 * 10) / 10;
        lines.push('💾 ' + sizeMb + ' MB' + (s.duration ? '  ⏱ ' + Math.round(s.duration / 60) + 'min' : ''));
      }
      lines.push("by Sanchit · @S4NCHITT · Murph's Streams");

      return {
        name   : streamName,
        title  : lines.join('\n'),
        url    : s.url,
        quality: quality,
        // Nuvio player sends these headers with every request — replaces proxy
        behaviorHints: {
          headers    : STREAM_HEADERS,
          bingeGroup : 'moviebox',
          notWebReady: false,
        },
        subtitles: [],
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// getStreams() — main Nuvio export, exact port of v4.0 getStreams()
// ─────────────────────────────────────────────────────────────────────────────

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  if (seasonNum  === undefined) seasonNum  = 1;
  if (episodeNum === undefined) episodeNum = 1;

  var cacheKey = 'mb_' + tmdbId + '_' + mediaType + '_' + seasonNum + '_' + episodeNum;
  var cached   = _streamCache.get(cacheKey);
  if (cached) { console.log('[MovieBox] Cache HIT: ' + cacheKey); return Promise.resolve(cached); }

  // Handle Nuvio's 'series' type
  if (mediaType === 'series') mediaType = 'tv';

  console.log('[MovieBox] TMDB ' + tmdbId + ' type=' + mediaType);

  // Step 1: TMDB title + year
  var tmdbUrl = 'https://api.themoviedb.org/3/' + (mediaType === 'tv' ? 'tv' : 'movie') + '/' + tmdbId + '?api_key=' + TMDB_API_KEY;

  var metaCached = _metaCache.get('tmdb_' + tmdbId + '_' + mediaType);
  var tmdbPromise = metaCached
    ? Promise.resolve(metaCached)
    : fetch(tmdbUrl, { headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json' } })
        .then(function (res) {
          if (!res.ok) throw new Error('TMDB fetch failed');
          return res.json();
        })
        .then(function (tmdbData) {
          var title   = mediaType === 'tv' ? tmdbData.name  : tmdbData.title;
          var dateStr = mediaType === 'tv' ? tmdbData.first_air_date : (tmdbData.release_date || '');
          var year    = dateStr.substring(0, 4);
          if (!title) throw new Error('No TMDB title');
          var result = { title: title, year: year };
          _metaCache.set('tmdb_' + tmdbId + '_' + mediaType, result);
          return result;
        });

  return tmdbPromise
    .then(function (meta) {
      var title = meta.title, year = meta.year;
      console.log('[MovieBox] "' + title + '" (' + year + ')');

      // Step 2: Parallel search + scoring
      return pickBest(title, year).then(function (res) {
        if (!res.picked) return [];

        var picked = res.picked;
        console.log('[MovieBox] Picked: "' + picked.title + '" (id=' + picked.subject_id + ')');

        // Step 3: Language label
        var langLabel;
        if (res.isHindiResult || hasHindiTag(picked.title)) {
          langLabel = 'Hindi';
        } else {
          langLabel = getLanguageFromTitle(picked.title);
        }
        console.log('[MovieBox] Language label: ' + langLabel);

        // Step 4: se/ep — trust mediaType, no getDetail() call needed (v4.0 optimization)
        var se = mediaType === 'tv' ? seasonNum  : 0;
        var ep = mediaType === 'tv' ? episodeNum : 0;

        // Step 5: Raw streams
        return getStreamsRaw(picked.subject_id, picked.detail_path, se, ep)
          .then(function (rawStreams) {
            if (!rawStreams.length) {
              console.log('[MovieBox] No streams returned');
              return [];
            }

            // Step 6: Format + sort → Nuvio stream objects
            var streams = formatStreams(
              rawStreams, title, year, langLabel, mediaType,
              mediaType === 'tv' ? seasonNum  : null,
              mediaType === 'tv' ? episodeNum : null
            );

            console.log('[MovieBox] Returning ' + streams.length + ' streams');
            if (streams.length) _streamCache.set(cacheKey, streams);
            return streams;
          });
      });
    })
    .catch(function (err) {
      console.error('[MovieBox] ' + err.message);
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