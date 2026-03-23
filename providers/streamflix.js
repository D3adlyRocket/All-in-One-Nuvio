/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                     StreamFlix — Nuvio Stream Plugin                        ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Source     › https://api.streamflix.app                                    ║
 * ║  Author     › Sanchit  |  TG: @S4NCHITT                                     ║
 * ║  Project    › Murph's Streams                                                ║
 * ║  Manifest   › https://badboysxs-morpheus.hf.space/manifest.json             ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Port       › Exact 1:1 of StreamFlix Provider v3.1                         ║
 * ║  Changes    › async/await → Promise chains  |  const/let → var              ║
 * ║             › AbortSignal kept where available, graceful fallback           ║
 * ║             › Stream objects reformatted for Nuvio with branding            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Config — identical to v3.1
// ─────────────────────────────────────────────────────────────────────────────

var TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
var SF_BASE      = 'https://api.streamflix.app';
var CONFIG_URL   = SF_BASE + '/config/config-streamflixapp.json';
var DATA_URL     = SF_BASE + '/data.json';
var SF_REFERER   = 'https://api.streamflix.app';
var SF_UA        = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var TAG          = '[StreamFlix]';
var TTL          = 30 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// State — identical to v3.1
// ─────────────────────────────────────────────────────────────────────────────

var st = {
  config: null, configTs: 0,
  items:  null, itemsTs:  0,
  tf: null, lf: null, kf: null,
  _cfgP: null, _dataP: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// LRU stream cache
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

// ─────────────────────────────────────────────────────────────────────────────
// HTTP — identical to v3.1
// ─────────────────────────────────────────────────────────────────────────────

function sfFetch(url, opts) {
  opts = opts || {};
  var headers = Object.assign(
    { 'User-Agent': SF_UA, 'Accept': 'application/json, */*', 'Referer': SF_REFERER },
    opts.headers || {}
  );
  var fetchOpts = Object.assign({}, opts, { headers: headers });
  // AbortSignal graceful — not all runtimes support it
  if (!fetchOpts.signal) {
    try { fetchOpts.signal = AbortSignal.timeout(25000); } catch (e) {}
  }
  return fetch(url, fetchOpts).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url.split('?')[0]);
    return r;
  });
}

function sfGet(url, retries) {
  if (retries === undefined) retries = 3;
  var attempt = 0;

  function tryOnce() {
    var timeoutMs = 30000 + attempt * 15000;
    var opts = {};
    try { opts.signal = AbortSignal.timeout(timeoutMs); } catch (e) {}
    return sfFetch(url, opts).catch(function (e) {
      attempt++;
      if (attempt >= retries) throw e;
      return new Promise(function (res) { setTimeout(res, 2000 * attempt); }).then(tryOnce);
    });
  }

  return tryOnce();
}

// ─────────────────────────────────────────────────────────────────────────────
// Config — identical to v3.1
// ─────────────────────────────────────────────────────────────────────────────

function getConfig() {
  if (st.config && Date.now() - st.configTs < TTL) return Promise.resolve(st.config);
  if (st._cfgP) return st._cfgP;

  st._cfgP = sfGet(CONFIG_URL)
    .then(function (r) { return r.json(); })
    .then(function (j) {
      st.config = j; st.configTs = Date.now();
      console.log(TAG + ' Config keys: ' + Object.keys(j || {}).join(', '));
      return j;
    })
    .finally(function () { st._cfgP = null; });

  return st._cfgP;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data + field discovery — identical to v3.1
// ─────────────────────────────────────────────────────────────────────────────

var TF = ['moviename','Movie_Name','movie_name','MovieName','title','Title','name','Name'];
var LF = ['movielink','Movie_Link','movie_link','MovieLink','link','Link','url','file','stream'];
var KF = ['moviekey','Movie_Key','movie_key','MovieKey','key','Key','firebase_key','id','ID'];

function pick(obj, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (obj[keys[i]] !== undefined && obj[keys[i]] !== '') return keys[i];
  }
  return null;
}

function extractItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  var checkKeys = ['data','movies','items','results','list','content'];
  for (var i = 0; i < checkKeys.length; i++) {
    var k = checkKeys[i];
    if (Array.isArray(raw[k]) && raw[k].length) return raw[k];
  }
  var vals = Object.values(raw);
  for (var j = 0; j < vals.length; j++) {
    var v = vals[j];
    if (Array.isArray(v) && v.length > 5 && typeof v[0] === 'object') return v;
  }
  return [];
}

function getData() {
  if (st.items && Date.now() - st.itemsTs < TTL) return Promise.resolve(st.items);
  if (st._dataP) return st._dataP;

  console.log(TAG + ' Fetching data.json...');
  st._dataP = sfGet(DATA_URL)
    .then(function (r) { return r.json(); })
    .then(function (raw) {
      var items = extractItems(raw);
      st.itemsTs = Date.now();
      if (!items.length) {
        console.log(TAG + ' data.json empty. Root keys: ' + Object.keys(raw || {}).join(', '));
        st.items = [];
        return [];
      }
      var first = items[0];
      st.tf = pick(first, TF);
      st.lf = pick(first, LF);
      st.kf = pick(first, KF);
      console.log(TAG + ' ' + items.length + ' items. First keys: ' + Object.keys(first).join(', '));
      console.log(TAG + ' Fields: title="' + st.tf + '" link="' + st.lf + '" key="' + st.kf + '"');
      console.log(TAG + ' First item: ' + JSON.stringify(first).substring(0, 300));
      st.items = items;
      return items;
    })
    .finally(function () { st._dataP = null; });

  return st._dataP;
}

// ─────────────────────────────────────────────────────────────────────────────
// Item accessors — identical to v3.1
// ─────────────────────────────────────────────────────────────────────────────

function getTitle(item) {
  if (!item) return '';
  if (st.tf && item[st.tf] !== undefined) return String(item[st.tf] || '');
  for (var i = 0; i < TF.length; i++) if (item[TF[i]]) return String(item[TF[i]]);
  var vals = Object.values(item);
  for (var j = 0; j < vals.length; j++) {
    var v = vals[j];
    if (typeof v === 'string' && v.length > 1 && v.length < 150 && !v.startsWith('http') && !v.includes('/')) return v;
  }
  return '';
}

function getLink(item) {
  if (!item) return '';
  if (st.lf && item[st.lf] !== undefined) return String(item[st.lf] || '');
  for (var i = 0; i < LF.length; i++) if (item[LF[i]]) return String(item[LF[i]]);
  return '';
}

function getKey(item) {
  if (!item) return '';
  if (st.kf && item[st.kf] !== undefined) return String(item[st.kf] || '');
  for (var i = 0; i < KF.length; i++) if (item[KF[i]]) return String(item[KF[i]]);
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Title matching — identical to v3.1
// ─────────────────────────────────────────────────────────────────────────────

function norm(s) {
  return (s || '').toLowerCase()
    .replace(/[:\-–—]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sim(a, b) {
  var s1 = norm(a), s2 = norm(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length >= 5 && s2.indexOf(s1) !== -1) return 0.9;
  if (s2.length >= 5 && s1.indexOf(s2) !== -1) return 0.9;
  var w1 = s1.split(' ').filter(function (w) { return w.length > 2; });
  var w2 = s2.split(' ').filter(function (w) { return w.length > 2; });
  if (!w1.length || !w2.length) return s1 === s2 ? 1 : 0;
  var m = w1.filter(function (w) {
    return w2.some(function (x) {
      return x === w || (x.length > 4 && w.length > 4 && (x.indexOf(w) !== -1 || w.indexOf(x) !== -1));
    });
  }).length;
  var ratio  = m / Math.max(w1.length, w2.length);
  var shorter = Math.min(w1.length, w2.length);
  if (shorter <= 1 && ratio < 1)    return 0;
  if (shorter <= 2 && ratio < 0.75) return 0;
  return ratio;
}

function findContent(title) {
  return getData().then(function (items) {
    if (!items.length) throw new Error('No items in data.json');
    var best = null, bestScore = 0;
    for (var i = 0; i < items.length; i++) {
      var t = getTitle(items[i]);
      if (!t) continue;
      var s = sim(title, t);
      if (s > bestScore) { bestScore = s; best = items[i]; }
    }
    var mt = best ? getTitle(best) : 'none';
    console.log(TAG + ' Best: "' + mt + '" (' + bestScore.toFixed(2) + ') for "' + title + '"');
    if (bestScore < 0.6) { console.log(TAG + ' No good match'); return null; }
    if (norm(mt).length < norm(title).length * 0.35 && norm(title).length > 6) {
      console.log(TAG + ' Match too short, rejected'); return null;
    }
    return best;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CDN tiers — identical to v3.1
// ─────────────────────────────────────────────────────────────────────────────

function tiers(config) {
  var r = {};
  if (!config) return r;
  if (config.premium && config.premium.length) r['1080p'] = config.premium;
  if (config.movies && config.movies.length) {
    var ps = {};
    (config.premium || []).forEach(function (u) { ps[u] = true; });
    var ex = config.movies.filter(function (u) { return !ps[u]; });
    if (ex.length) r['720p'] = ex;
    else if (!r['1080p']) r['1080p'] = config.movies;
  }
  if (!Object.keys(r).length) {
    Object.keys(config).forEach(function (k) {
      var v = config[k];
      if (Array.isArray(v) && v.length && typeof v[0] === 'string' && v[0].startsWith('http')) {
        console.log(TAG + ' CDN key "' + k + '": ' + v[0].substring(0, 60));
        r[k] = v;
      }
    });
  }
  console.log(TAG + ' CDN tiers: ' + Object.keys(r).join(', '));
  return r;
}

function pickMirror(mirrors, path) {
  if (!mirrors || !mirrors.length) return Promise.resolve(null);

  var checks = mirrors.map(function (base, i) {
    var url = base + path;
    var opts = { method: 'GET', headers: { 'User-Agent': SF_UA, 'Referer': SF_REFERER, 'Range': 'bytes=0-255' } };
    try { opts.signal = AbortSignal.timeout(7000); } catch (e) {}
    return fetch(url, opts)
      .then(function (r) {
        var ok = r.ok || r.status === 206 || [301, 302, 307].includes(r.status);
        if (ok) console.log(TAG + ' Mirror ' + i + ' OK for "' + path + '"');
        return ok ? { url: url, i: i } : null;
      })
      .catch(function () { return null; });
  });

  return Promise.all(checks).then(function (res) {
    var ok = res.filter(Boolean).sort(function (a, b) { return a.i - b.i; });
    if (ok.length) return ok[0].url;
    console.log(TAG + ' All mirrors failed "' + path + '", fallback to first');
    return mirrors[0] + path;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket — single season episodes — identical to v3.1
// ─────────────────────────────────────────────────────────────────────────────

function wsEpisodes(movieKey, season) {
  return new Promise(function (res, rej) {
    var WS = null;
    try { WS = require('ws'); } catch (e) {}
    if (!WS) { try { WS = typeof WebSocket !== 'undefined' ? WebSocket : null; } catch (e) {} }
    if (!WS) return rej(new Error('No WS'));

    var ws, buf = '', eps = {};
    try {
      ws = new WS('wss://chilflix-410be-default-rtdb.asia-southeast1.firebasedatabase.app/.ws?ns=chilflix-410be-default-rtdb&v=5');
    } catch (e) { return rej(new Error('WS: ' + e.message)); }

    var t = setTimeout(function () { try { ws.close(); } catch (e) {} rej(new Error('WS timeout')); }, 15000);

    ws.onopen = function () {
      try { ws.send(JSON.stringify({ t: 'd', d: { a: 'q', r: season, b: { p: 'Data/' + movieKey + '/seasons/' + season + '/episodes', h: '' } } })); }
      catch (e) { clearTimeout(t); rej(e); }
    };

    ws.onmessage = function (ev) {
      try {
        buf += typeof ev.data === 'string' ? ev.data : ev.data.toString();
        var msg = JSON.parse(buf); buf = '';
        if (msg.t === 'd') {
          var b = (msg.d && msg.d.b) || {};
          if (b.d && typeof b.d === 'object') {
            Object.keys(b.d).forEach(function (k) {
              var v = b.d[k];
              if (v && typeof v === 'object') {
                eps[parseInt(k)] = { key: v.key, link: v.link, name: v.name, overview: v.overview, runtime: v.runtime };
              }
            });
          }
          if (b.s === 'ok') { clearTimeout(t); try { ws.close(); } catch (e) {} res(eps); }
        }
      } catch (e) {}
    };

    ws.onerror = function () { clearTimeout(t); rej(new Error('WS err')); };
    ws.onclose = function () { clearTimeout(t); Object.keys(eps).length ? res(eps) : rej(new Error('WS empty')); };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket — all seasons — identical to v3.1
// ─────────────────────────────────────────────────────────────────────────────

function wsAllSeasons(movieKey, totalSeasons) {
  if (!totalSeasons) totalSeasons = 1;
  return new Promise(function (resolve, reject) {
    var WS = null;
    try { WS = require('ws'); } catch (e) {}
    if (!WS) { try { WS = typeof WebSocket !== 'undefined' ? WebSocket : null; } catch (e) {} }
    if (!WS) return reject(new Error('No WS'));

    var ws, buf = '', seasonsData = {}, currentSeason = 1, completedSeasons = 0;

    try {
      ws = new WS('wss://chilflix-410be-default-rtdb.asia-southeast1.firebasedatabase.app/.ws?ns=chilflix-410be-default-rtdb&v=5');
    } catch (e) { return reject(new Error('WS: ' + e.message)); }

    var overallTimeout = setTimeout(function () {
      try { ws.close(); } catch (e) {}
      resolve(seasonsData); // partial data still useful
    }, 30000);

    function sendSeasonRequest(s) {
      try { ws.send(JSON.stringify({ t: 'd', d: { a: 'q', r: s, b: { p: 'Data/' + movieKey + '/seasons/' + s + '/episodes', h: '' } } })); }
      catch (e) {}
    }

    ws.onopen = function () { sendSeasonRequest(currentSeason); };

    ws.onmessage = function (ev) {
      try {
        buf += typeof ev.data === 'string' ? ev.data : ev.data.toString();
        var msg = JSON.parse(buf); buf = '';
        if (msg.t === 'd') {
          var b = (msg.d && msg.d.b) || {};
          if (b.d && typeof b.d === 'object') {
            var seasonEps = seasonsData[currentSeason] || {};
            Object.keys(b.d).forEach(function (k) {
              var v = b.d[k];
              if (v && typeof v === 'object') {
                seasonEps[parseInt(k)] = { key: v.key, link: v.link, name: v.name, overview: v.overview, runtime: v.runtime };
              }
            });
            seasonsData[currentSeason] = seasonEps;
          }
          if (msg.d && msg.d.r === currentSeason && b.s === 'ok') {
            completedSeasons++;
            if (completedSeasons < totalSeasons) {
              currentSeason++;
              sendSeasonRequest(currentSeason);
            } else {
              clearTimeout(overallTimeout);
              try { ws.close(); } catch (e) {}
              resolve(seasonsData);
            }
          }
        }
      } catch (e) {}
    };

    ws.onerror = function () { clearTimeout(overallTimeout); reject(new Error('WS err')); };
    ws.onclose = function () { clearTimeout(overallTimeout); };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream builder — Nuvio format with branding
// ─────────────────────────────────────────────────────────────────────────────

function makeStream(url, quality, titleLine, langLabel) {
  return {
    name    : '🎬 StreamFlix | ' + quality + ' | ' + langLabel,
    title   : titleLine + '\n'
            + '📺 ' + quality + '  🔊 ' + langLabel + '\n'
            + "by Sanchit · @S4NCHITT · Murph's Streams",
    url     : url,
    quality : quality,
    behaviorHints: {
      notWebReady: false,
      bingeGroup : 'streamflix',
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Movie handler — identical logic to v3.1, Nuvio output
// ─────────────────────────────────────────────────────────────────────────────

function doMovie(item, config, tmdbTitle) {
  var link = getLink(item), name = getTitle(item);
  console.log(TAG + ' Movie: "' + name + '" link="' + link + '"');
  if (!link) return Promise.resolve([]);

  var cdnTiers = tiers(config);
  if (!Object.keys(cdnTiers).length) return Promise.resolve([]);

  var langLabel = 'Hindi'; // audio detection disabled for speed — same as v3.1

  var checks = Object.keys(cdnTiers).map(function (q) {
    return pickMirror(cdnTiers[q], link).then(function (url) { return { q: q, url: url }; });
  });

  return Promise.all(checks).then(function (resolved) {
    var seen = {}, streams = [];
    resolved.forEach(function (r) {
      if (!r.url || seen[r.url]) return;
      seen[r.url] = true;
      streams.push(makeStream(r.url, r.q, tmdbTitle || name, langLabel));
    });
    console.log(TAG + ' ' + streams.length + ' movie stream(s)');
    return streams;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TV handler — identical logic to v3.1, Nuvio output
// ─────────────────────────────────────────────────────────────────────────────

function doTV(item, config, s, e, tmdbTitle) {
  var key  = getKey(item), name = getTitle(item);
  console.log(TAG + ' TV: "' + name + '" key="' + key + '" S' + s + 'E' + e);

  var displayTitle = (tmdbTitle || name)
    + ' S' + String(s).padStart(2, '0')
    + 'E' + String(e).padStart(2, '0');

  var cdnTiers = tiers(config);
  if (!Object.keys(cdnTiers).length) return Promise.resolve([]);

  // Total seasons from movieduration field — identical to v3.1
  var durationStr  = item.movieduration || item.duration || '';
  var seasonMatch  = String(durationStr).match(/(\d+)\s*[Ss]eason/);
  var totalSeasons = seasonMatch ? parseInt(seasonMatch[1]) : s;

  var langLabel = 'Hindi';

  // Step 1: try single-season WS, fall back to multi-season
  var epLinkPromise;
  if (key) {
    epLinkPromise = wsEpisodes(key, s)
      .then(function (eps) {
        console.log(TAG + ' WS ep keys for S' + s + ': [' + Object.keys(eps).join(',') + ']');
        var ep = eps[e - 1]; // 0-indexed — same as v3.1
        if (ep && ep.link) { console.log(TAG + ' WS link: ' + ep.link); return ep.link; }
        if (ep) console.log(TAG + ' WS ep data: ' + JSON.stringify(ep).substring(0, 100));
        return null;
      })
      .catch(function (err) {
        console.log(TAG + ' Single-season WS failed (' + err.message + '), trying multi-season...');
        return wsAllSeasons(key, totalSeasons)
          .then(function (allSeasons) {
            console.log(TAG + ' Multi-season WS got seasons: [' + Object.keys(allSeasons).join(',') + ']');
            var seasonData = allSeasons[s];
            if (seasonData) {
              var ep = seasonData[e - 1];
              if (ep && ep.link) { console.log(TAG + ' Multi-season WS link: ' + ep.link); return ep.link; }
            }
            return null;
          })
          .catch(function (e2) {
            console.log(TAG + ' Multi-season WS also failed: ' + e2.message);
            return null;
          });
      });
  } else {
    epLinkPromise = Promise.resolve(null);
  }

  return epLinkPromise.then(function (epLink) {
    // Build candidate paths — WS link first, then pattern fallbacks — identical to v3.1
    var paths = [];
    if (epLink) paths.push(epLink);
    if (key) {
      paths.push('tv/' + key + '/s' + s + '/episode' + e + '.mkv');
      paths.push('tv/' + key + '/s' + s + '/ep' + e + '.mkv');
      paths.push('tv/' + key + '/s' + String(s).padStart(2,'0') + 'e' + String(e).padStart(2,'0') + '.mkv');
      paths.push('tv/' + key + '/Season' + s + '/Episode' + e + '.mkv');
      paths.push('tv/' + key + '/season' + s + '/episode' + e + '.mkv');
      paths.push('tv/' + key + '/' + s + '/' + e + '.mkv');
    }

    // Try each path sequentially until one yields valid mirrors
    function tryPath(idx) {
      if (idx >= paths.length) {
        // Last-resort fallback — identical to v3.1
        if (key && Object.keys(cdnTiers).length) {
          var fp = epLink || ('tv/' + key + '/s' + s + '/episode' + e + '.mkv');
          var streams = Object.keys(cdnTiers)
            .filter(function (q) { return cdnTiers[q] && cdnTiers[q].length; })
            .map(function (q) { return makeStream(cdnTiers[q][0] + fp, q, displayTitle, langLabel); });
          console.log(TAG + ' ' + streams.length + ' fallback TV stream(s)');
          return Promise.resolve(streams);
        }
        return Promise.resolve([]);
      }

      var path = paths[idx];
      var checks = Object.keys(cdnTiers).map(function (q) {
        return pickMirror(cdnTiers[q], path).then(function (url) { return { q: q, url: url }; });
      });

      return Promise.all(checks).then(function (resolved) {
        var valid = resolved.filter(function (r) { return !!r.url; });
        if (!valid.length) return tryPath(idx + 1);

        var seen = {}, streams = [];
        valid.forEach(function (r) {
          if (!r.url || seen[r.url]) return;
          seen[r.url] = true;
          streams.push(makeStream(r.url, r.q, displayTitle, langLabel));
        });

        if (!streams.length) return tryPath(idx + 1);
        console.log(TAG + ' ' + streams.length + ' TV stream(s) via "' + path + '"');
        return streams;
      });
    }

    return tryPath(0);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// getStreams — main Nuvio export, identical flow to v3.1
// ─────────────────────────────────────────────────────────────────────────────

function getStreams(tmdbId, mediaType, sNum, eNum) {
  if (mediaType === undefined) mediaType = 'movie';
  if (mediaType === 'series') mediaType = 'tv';
  if (sNum === undefined || sNum === null) sNum = 1;
  if (eNum === undefined || eNum === null) eNum = 1;

  var cacheKey = 'sf_' + tmdbId + '_' + mediaType + '_' + sNum + '_' + eNum;
  var cached   = _streamCache.get(cacheKey);
  if (cached) { console.log(TAG + ' Cache HIT: ' + cacheKey); return Promise.resolve(cached); }

  console.log(TAG + ' TMDB ' + tmdbId + ' type=' + mediaType + ' S' + sNum + 'E' + eNum);

  var isTv    = mediaType === 'tv';
  var tmdbUrl = 'https://api.themoviedb.org/3/' + (isTv ? 'tv' : 'movie') + '/' + tmdbId + '?api_key=' + TMDB_API_KEY;

  return Promise.all([
    sfFetch(tmdbUrl).then(function (r) { return r.json(); }),
    getConfig(),
  ])
    .then(function (results) {
      var tmdb   = results[0];
      var config = results[1];
      var title  = isTv ? tmdb.name : tmdb.title;
      if (!title) throw new Error('No TMDB title');
      console.log(TAG + ' "' + title + '"');

      return findContent(title).then(function (match) {
        if (!match) return [];
        var streamPromise = isTv
          ? doTV(match, config, parseInt(sNum), parseInt(eNum), title)
          : doMovie(match, config, title);

        return streamPromise.then(function (streams) {
          if (streams.length) _streamCache.set(cacheKey, streams);
          return streams;
        });
      });
    })
    .catch(function (e) {
      console.error(TAG + ' ' + e.message);
      return [];
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams, getData };
} else {
  global.getStreams = getStreams;
}