/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                      MovieBox — Nuvio Stream Plugin                         ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Source     › https://themoviebox.org                                       ║
 * ║  Author     › Sanchit  |  TG: @S4NCHITT                                     ║
 * ║  Project    › Murph's Streams                                                ║
 * ║  Manifest   › https://badboysxs-morpheus.hf.space/manifest.json             ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Languages  › Hindi · Tamil · Telugu · English (auto-detected)              ║
 * ║  Quality    › 360p / 480p / 720p / 1080p / Auto                             ║
 * ║  Search     › Direct JSON API — no HTML scraping, no Nuxt parsing           ║
 * ║  Speed      › Parallel queries, early-exit on first stream hit              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

var TMDB_KEY  = '439c478a771f35c05022f9feabcca01c';
var MB_BASE   = 'https://themoviebox.org';
var TAG       = '[MovieBox]';
var UA        = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0';

// Headers sent with every segment/chunk request by the player
var STREAM_HEADERS = {
  'User-Agent'     : UA,
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
  this.max = max; this.ttl = ttl; this.d = {}; this.k = [];
}
Cache.prototype.get = function (k) {
  var e = this.d[k];
  if (!e) return undefined;
  if (Date.now() - e.t > this.ttl) { delete this.d[k]; return undefined; }
  return e.v;
};
Cache.prototype.set = function (k, v) {
  if (this.d[k]) { this.d[k] = { v: v, t: Date.now() }; return; }
  if (this.k.length >= this.max) delete this.d[this.k.shift()];
  this.k.push(k); this.d[k] = { v: v, t: Date.now() };
};

var streamCache = new Cache(200, 20 * 60 * 1000);  // 20 min
var metaCache   = new Cache(500, 24 * 60 * 60 * 1000);
var srchCache   = new Cache(300, 10 * 60 * 1000);  // 10 min

// ─────────────────────────────────────────────────────────────────────────────
// HTTP — simple fetch wrappers
// ─────────────────────────────────────────────────────────────────────────────

function get(url, headers) {
  return fetch(url, {
    headers  : Object.assign({ 'User-Agent': UA, 'Accept': 'application/json', 'Accept-Language': 'en-US,en;q=0.9' }, headers || {}),
    redirect : 'follow',
  }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TMDB
// ─────────────────────────────────────────────────────────────────────────────

function tmdb(id, type) {
  var key = 'mb_' + id + type;
  var hit = metaCache.get(key);
  if (hit) return Promise.resolve(hit);

  var isTv = type === 'tv' || type === 'series';
  var url  = 'https://api.themoviedb.org/3/' + (isTv ? 'tv' : 'movie') + '/' + id + '?api_key=' + TMDB_KEY;

  return get(url).then(function (d) {
    var title = isTv ? d.name  : d.title;
    var date  = isTv ? d.first_air_date : d.release_date;
    var year  = (date || '').slice(0, 4);
    var r = { title: title || null, year: year, isTv: isTv };
    if (title) metaCache.set(key, r);
    return r;
  }).catch(function (e) {
    console.log(TAG + ' TMDB error: ' + e.message); return null;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MovieBox Search API
// Direct JSON endpoint — much faster than HTML+Nuxt scraping
// ─────────────────────────────────────────────────────────────────────────────

var SEARCH_HEADERS = {
  'User-Agent'     : UA,
  'Accept'         : 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-Client-Info'  : '{"timezone":"Asia/Kolkata"}',
  'Referer'        : MB_BASE + '/newWeb/searchResult?keyword=',
  'Sec-Fetch-Dest' : 'empty',
  'Sec-Fetch-Mode' : 'cors',
  'Sec-Fetch-Site' : 'same-origin',
  'Cache-Control'  : 'no-cache',
};

var PLAY_HEADERS = {
  'User-Agent'     : UA,
  'Accept'         : 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-Client-Info'  : '{"timezone":"Asia/Kolkata"}',
  'Sec-Fetch-Dest' : 'empty',
  'Sec-Fetch-Mode' : 'cors',
  'Sec-Fetch-Site' : 'same-origin',
  'Cache-Control'  : 'no-cache',
};

/**
 * Call the MovieBox search JSON API directly.
 * Returns array of { subject_id, title, subject_type, detail_path, release_date, language }
 */
function mbSearch(query) {
  var cached = srchCache.get(query);
  if (cached) return Promise.resolve(cached);

  // Direct JSON API endpoint (not the HTML search page)
  var url = MB_BASE + '/wefeed-h5api-bff/subject/search'
    + '?keyword=' + encodeURIComponent(query)
    + '&pageNum=1&pageSize=20';

  console.log(TAG + ' API search: "' + query + '"');

  return fetch(url, { headers: SEARCH_HEADERS, redirect: 'follow' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      // Handle both possible response shapes
      var items = [];
      if (data && data.data) {
        items = data.data.list || data.data.items || data.data || [];
      }
      if (!Array.isArray(items)) items = [];

      var results = items.map(function (item) {
        return {
          subject_id   : item.subjectId || item.subject_id || item.id,
          title        : item.title || item.name || '',
          subject_type : item.subjectType || item.subject_type || item.type,
          detail_path  : item.detailPath  || item.detail_path  || '',
          release_date : item.releaseDate || item.release_date || '',
          language     : item.language || item.lang || item.dubbed_lang || null,
        };
      }).filter(function (r) { return r.subject_id && r.title; });

      console.log(TAG + ' "' + query + '" → ' + results.length + ' result(s)');
      if (results.length) srchCache.set(query, results);
      return results;
    })
    .catch(function (err) {
      console.log(TAG + ' Search API error ("' + query + '"): ' + err.message);
      // Fallback: try alternate endpoint path
      return mbSearchFallback(query);
    });
}

/**
 * Fallback search using the Nuxt SSR page but with a regex shortcut
 * instead of full Nuxt data resolution — much faster than before.
 */
function mbSearchFallback(query) {
  var url = MB_BASE + '/newWeb/searchResult?keyword=' + encodeURIComponent(query);
  console.log(TAG + ' Fallback HTML search: "' + query + '"');

  return fetch(url, {
    headers  : { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    redirect : 'follow',
  })
    .then(function (r) { return r.text(); })
    .then(function (html) {
      // Fast regex extraction instead of full Nuxt tree walk
      var results = [];
      // Extract subjectId + title + detailPath + subjectType from the Nuxt blob
      var nuxtIdx = html.indexOf('__NUXT_DATA__');
      if (nuxtIdx === -1) return results;

      var start = html.indexOf('[', nuxtIdx);
      var end   = html.indexOf('</script>', nuxtIdx);
      if (start === -1 || end === -1) return results;

      var raw;
      try { raw = JSON.parse(html.substring(start, end)); }
      catch (e) { return results; }

      // Walk array looking for objects that have subjectId + detailPath
      var seen = {};
      for (var i = 0; i < raw.length; i++) {
        var item = raw[i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        if (!item.subjectId || !item.detailPath) continue;
        var sid = String(item.subjectId);
        if (seen[sid]) continue;
        seen[sid] = true;
        results.push({
          subject_id   : item.subjectId,
          title        : item.title || '',
          subject_type : item.subjectType,
          detail_path  : item.detailPath,
          release_date : item.releaseDate || '',
          language     : item.language || item.lang || null,
        });
      }

      console.log(TAG + ' Fallback found ' + results.length + ' result(s)');
      if (results.length) srchCache.set(query, results);
      return results;
    })
    .catch(function (e) {
      console.log(TAG + ' Fallback error: ' + e.message);
      return [];
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

function norm(s) {
  return (s || '').toLowerCase()
    .replace(/\[.*?\]/g, ' ').replace(/\(.*?\)/g, ' ')
    .replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function score(r, title, year) {
  var nt = norm(title), nr = norm(r.title || '');
  var ry = (r.release_date || '').slice(0, 4);
  if (!nt || !nr) return 0;
  if (nr === nt) return 100;
  if (nr.indexOf(nt) !== -1 || nt.indexOf(nr) !== -1) return 75;
  var wt = nt.split(' ').filter(function(w){return w.length>2;});
  var wr = nr.split(' ').filter(function(w){return w.length>2;});
  if (!wt.length || !wr.length) return 0;
  var m = wt.filter(function(w){return wr.indexOf(w)!==-1;}).length;
  var s = Math.round((m / Math.max(wt.length, wr.length)) * 55);
  if (year && ry && year === ry) s += 30;
  return s;
}

function isHindi(r) {
  return ((r.language || '').toLowerCase().includes('hindi')) ||
         (r.title || '').toLowerCase().includes('hindi');
}

function hasHindiTag(t) { return (t||'').toLowerCase().includes('[hindi]'); }

function langFromTitle(t) {
  var l = (t||'').toLowerCase();
  if (/\[hindi\]|\(hindi\)/.test(l))    return 'Hindi';
  if (/\[tamil\]|\(tamil\)/.test(l))    return 'Tamil';
  if (/\[telugu\]|\(telugu\)/.test(l))  return 'Telugu';
  if (/\[english\]|\(english\)/.test(l))return 'English';
  return 'Original';
}

// ─────────────────────────────────────────────────────────────────────────────
// pickBest — run all queries IN PARALLEL, pick best scored result
// ─────────────────────────────────────────────────────────────────────────────

function pickBest(title, year) {
  // All 4 queries fire simultaneously
  var queries = [
    title + ' Hindi',
    title,
    year ? title + ' ' + year : null,
    year ? title + ' ' + year + ' Hindi' : null,
  ].filter(Boolean);

  return Promise.all(queries.map(function(q) {
    return mbSearch(q).catch(function(){return [];});
  })).then(function(allResults) {

    var allValid  = [];
    var hindiList = [];
    var bestNH    = { r: null, s: 0 };

    allResults.forEach(function(arr) {
      var valid = arr.filter(function(r){ return r.subject_type===1||r.subject_type===2; });
      allValid = allValid.concat(valid);
      valid.forEach(function(r) {
        if (!isHindi(r)) { var s=score(r,title,year); if(s>bestNH.s) bestNH={r:r,s:s}; }
      });
      hindiList = hindiList.concat(valid.filter(isHindi));
    });

    // If good non-Hindi found but no Hindi — do one extra Hindi retry
    var extra = Promise.resolve();
    if (bestNH.r && bestNH.s >= 60 && !hindiList.length) {
      extra = mbSearch(bestNH.r.title + ' Hindi').catch(function(){return[];}).then(function(arr){
        var valid = arr.filter(function(r){return r.subject_type===1||r.subject_type===2;});
        allValid  = allValid.concat(valid);
        hindiList = hindiList.concat(valid.filter(isHindi));
      });
    }

    return extra.then(function() {
      var picked = null, isHindiR = false;

      // Best Hindi (threshold 20)
      if (hindiList.length) {
        var best = 0;
        hindiList.forEach(function(r){ var s=score(r,title,year); if(s>best){best=s;picked=r;} });
        if (picked && best >= 20) { isHindiR = true; console.log(TAG+' Best Hindi: "'+picked.title+'" s='+best); }
        else { picked = null; }
      }

      // Best overall (threshold 30)
      if (!picked) {
        var best2 = 0;
        allValid.forEach(function(r){ var s=score(r,title,year); if(s>best2){best2=s;picked=r;} });
        if (picked && best2 >= 30) {
          isHindiR = hasHindiTag(picked.title);
          console.log(TAG+' Best overall: "'+picked.title+'" s='+best2);
        } else {
          console.log(TAG+' No match found'); return { picked:null, isHindiR:false };
        }
      }

      return { picked: picked, isHindiR: isHindiR };
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch streams from play API
// ─────────────────────────────────────────────────────────────────────────────

function fetchStreams(subjectId, detailPath, se, ep) {
  var url = MB_BASE + '/wefeed-h5api-bff/subject/play'
    + '?subjectId=' + encodeURIComponent(subjectId)
    + '&se='        + (se  != null ? se  : 0)
    + '&ep='        + (ep  != null ? ep  : 0)
    + '&detailPath='+ encodeURIComponent(detailPath);

  var ref = MB_BASE + '/movies/' + detailPath
    + '?id=' + subjectId + '&type=/movie/detail&detailSe=&detailEp=&lang=en';

  var hdrs = Object.assign({}, PLAY_HEADERS, { 'Referer': ref });

  return fetch(url, { headers: hdrs, redirect: 'follow' })
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(d){
      if (!d || d.code !== 0) throw new Error(d && d.message ? d.message : 'API error');
      return (d.data && d.data.streams) ? d.data.streams : [];
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Build stream object
// ─────────────────────────────────────────────────────────────────────────────

function resLabel(res) {
  if (!res && res !== 0) return 'Auto';
  var m = String(res).match(/(\d+)/);
  return m ? m[1] + 'p' : String(res);
}

function buildStream(raw, title, year, lang, isTv, se, ep) {
  var q = resLabel(raw.resolutions);
  var epTag = (isTv && se != null && ep != null)
    ? ' · S' + String(se).padStart(2,'0') + 'E' + String(ep).padStart(2,'0') : '';

  var name  = '📺 MovieBox | ' + q + ' | ' + lang;

  var lines = [];
  lines.push(title + (year ? ' (' + year + ')' : '') + epTag);
  lines.push('📺 ' + q + '  🔊 ' + lang + (raw.codecName ? '  🎞 ' + raw.codecName : ''));
  if (raw.size) {
    var mb = Math.round(Number(raw.size)/1024/1024*10)/10;
    lines.push('💾 ' + mb + ' MB' + (raw.duration ? '  ⏱ ' + Math.round(raw.duration/60) + 'min' : ''));
  }
  lines.push("by Sanchit · @S4NCHITT · Murph's Streams");

  return {
    name   : name,
    title  : lines.join('\n'),
    url    : raw.url || '',
    quality: q,
    behaviorHints: {
      headers    : STREAM_HEADERS,
      bingeGroup : 'moviebox',
      notWebReady: false,
    },
    subtitles: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getStreams — main export
// ─────────────────────────────────────────────────────────────────────────────

function getStreams(tmdbId, type, season, episode) {
  var cacheKey = 'mb_' + tmdbId + '_' + type + '_' + season + '_' + episode;
  var hit = streamCache.get(cacheKey);
  if (hit) { console.log(TAG + ' Cache HIT'); return Promise.resolve(hit); }

  var mediaType  = (type === 'series') ? 'tv' : (type || 'movie');
  var isTv       = mediaType === 'tv';
  var se         = isTv ? (season  ? parseInt(season)  : 1) : 0;
  var ep         = isTv ? (episode ? parseInt(episode) : 1) : 0;

  console.log(TAG + ' ► ' + tmdbId + ' | ' + mediaType + (isTv ? ' S'+se+'E'+ep : ''));

  return tmdb(tmdbId, mediaType).then(function(d) {
    if (!d || !d.title) { console.log(TAG + ' TMDB failed'); return []; }
    var title = d.title, year = d.year;
    console.log(TAG + ' "' + title + '" (' + year + ')');

    return pickBest(title, year).then(function(res) {
      var picked = res.picked, isHindiR = res.isHindiR;
      if (!picked) return [];

      console.log(TAG + ' Picked: "' + picked.title + '" id=' + picked.subject_id);

      // Language label
      var lang = (isHindiR || hasHindiTag(picked.title)) ? 'Hindi' : langFromTitle(picked.title);
      console.log(TAG + ' Language: ' + lang);

      // Fetch streams
      return fetchStreams(picked.subject_id, picked.detail_path, se, ep)
        .then(function(raws) {
          if (!raws.length) { console.log(TAG + ' No streams'); return []; }

          // Sort highest resolution first
          var sorted = raws.slice().sort(function(a,b){
            return Number(b.resolutions||0) - Number(a.resolutions||0);
          });

          var streams = sorted
            .filter(function(s){ return !!s.url; })
            .map(function(s){ return buildStream(s, title, year, lang, isTv, isTv?se:null, isTv?ep:null); });

          console.log(TAG + ' ✔ ' + streams.length + ' stream(s)');
          if (streams.length) streamCache.set(cacheKey, streams);
          return streams;
        })
        .catch(function(e) {
          console.log(TAG + ' fetchStreams error: ' + e.message);
          return [];
        });
    });
  }).catch(function(e) {
    console.error(TAG + ' Fatal: ' + e.message); return [];
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