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

/**
 * Find the single best match (used as the reference item for info extraction).
 */
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

/**
 * Find ALL items that match the title well enough — each is a different
 * language/audio version. Returns array of { item, langLabel, score }.
 *
 * StreamFlix stores separate data.json entries per language version:
 *   "Pushpa 2 [Hindi]"  → Hindi dub
 *   "Pushpa 2 [Tamil]"  → Tamil original
 *   "Pushpa 2 [Telugu]" → Telugu original
 *   "Pushpa 2"          → default (usually Hindi)
 *
 * We collect every item whose sim() >= MATCH_THRESHOLD (0.6) and whose
 * normalised title isn't too short (same guard as findContent).
 */
function findAllContent(title) {
  return getData().then(function (items) {
    if (!items.length) throw new Error('No items in data.json');

    var THRESHOLD  = 0.6;
    var normTitle  = norm(title);
    var candidates = [];
    var bestScore  = 0;

    for (var i = 0; i < items.length; i++) {
      var t = getTitle(items[i]);
      if (!t) continue;
      var s = sim(title, t);
      if (s < THRESHOLD) continue;
      if (norm(t).length < normTitle.length * 0.35 && normTitle.length > 6) continue;
      if (s > bestScore) bestScore = s;
      candidates.push({ item: items[i], rawTitle: t, score: s });
    }

    if (!candidates.length) {
      console.log(TAG + ' No matches for "' + title + '"');
      return [];
    }

    // Accept items within 0.15 of the best score so we don't grab unrelated titles
    var scoreFloor = Math.max(THRESHOLD, bestScore - 0.15);
    candidates = candidates.filter(function (c) { return c.score >= scoreFloor; });

    // Detect all audio langs per candidate — stored as array e.g. ["Hindi","Tamil"]
    candidates.forEach(function (c) {
      c.langs    = getAllLangsFromItem(c.item);   // array
      c.langLabel = c.langs;                      // alias (used in dedup key via toString)
    });

    // De-duplicate by (link/key + language) so the same file isn't returned twice
    var seenKeys = {};
    candidates = candidates.filter(function (c) {
      var dedupeKey = (getLink(c.item) || getKey(c.item) || c.rawTitle) + '|' + c.langLabel;
      // Also skip if it has the exact same detected languages as a previously seen item
      if (seenKeys[dedupeKey]) return false;
      seenKeys[dedupeKey] = true;
      return true;
    });

    console.log(TAG + ' Found ' + candidates.length + ' language variant(s) for "' + title + '": '
      + candidates.map(function (c) { return '"' + c.rawTitle + '" [' + c.langLabel + ']'; }).join(', '));

    return candidates;
  });
}

/**
 * Extract ALL audio languages mentioned in an item's title or language field.
 *
 * StreamFlix item titles often look like:
 *   "Pushpa 2 [Hindi + Tamil + Telugu]"
 *   "KGF Chapter 2 [Hindi-Dubbed]"
 *   "The Boys (English + Hindi)"
 *   "RRR [Telugu] [Hindi] [Tamil]"
 *   "Inception (Multi Audio)"
 *
 * We also check item.movielanguage / item.language / item.movielang fields.
 * Returns array like ["Hindi", "Tamil", "Telugu"].
 * Falls back to ["Hindi"] if nothing detected.
 */
function getAllLangsFromItem(item) {
  var titleStr  = getTitle(item) || '';
  var langField = item.movielanguage || item.language || item.movielang
               || item.Language     || item.audio    || item.audiolang || '';
  var corpus    = (titleStr + ' ' + langField).toLowerCase();

  var LANG_PATTERNS = [
    ['Hindi',     /hindi/],
    ['Tamil',     /tamil/],
    ['Telugu',    /telugu/],
    ['Kannada',   /kannada/],
    ['Malayalam', /malayalam/],
    ['Bengali',   /bengali/],
    ['Punjabi',   /punjabi/],
    ['English',   /english/],
    ['Korean',    /korean/],
    ['Japanese',  /japanese/],
    ['Chinese',   /chinese|mandarin/],
    ['Spanish',   /spanish/],
    ['French',    /french/],
    ['Arabic',    /arabic/],
    ['Russian',   /russian/],
    ['Turkish',   /turkish/],
  ];

  var found = [];
  for (var i = 0; i < LANG_PATTERNS.length; i++) {
    if (LANG_PATTERNS[i][1].test(corpus)) found.push(LANG_PATTERNS[i][0]);
  }

  // "Multi Audio" / "Multi-Audio" — means multiple common dubs
  if (!found.length && /multi[\s\-]?audio|multi.*dub|dubbed/i.test(corpus)) {
    found = ['Hindi', 'Tamil', 'Telugu', 'English'];
  }

  return found.length ? found : ['Hindi'];
}

/**
 * Single-language string for legacy callers (first detected language).
 */
function getLangFromItemTitle(t) {
  return getAllLangsFromItem({ title: t })[0] || 'Hindi';
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
// Stream builder — Nuvio format with rich info + branding
//
// info object (all optional):
//   { genre, duration, rating, imdb, epName, epOverview, epRuntime, seasons }
// ─────────────────────────────────────────────────────────────────────────────

function makeStream(url, quality, titleLine, langs, info) {
  info = info || {};

  // langs can be string (legacy) or array — normalise to array
  if (!Array.isArray(langs)) langs = langs ? [langs] : ['Hindi'];
  var langStr   = langs.join(' + ');           // "Hindi + Tamil + Telugu"
  var langShort = langs.slice(0, 3).join(' + ') + (langs.length > 3 ? ' +' + (langs.length - 3) : '');

  // ── Name (picker row) ──────────────────────────────────────────────────────
  var streamName = '🎬 StreamFlix | ' + quality + ' | ' + langShort;

  // ── Title detail lines ─────────────────────────────────────────────────────
  var lines = [];
  lines.push(titleLine);

  // Quality + all languages
  lines.push('📺 ' + quality + '  🔊 ' + langStr);

  // Genre + rating
  var metaParts = [];
  if (info.genre)    metaParts.push('🎭 ' + info.genre);
  if (info.imdb)     metaParts.push('⭐ IMDb ' + info.imdb);
  else if (info.rating) metaParts.push('⭐ ' + info.rating);
  if (metaParts.length) lines.push(metaParts.join('  '));

  // Runtime / seasons
  var runtimeParts = [];
  if (info.epRuntime)  runtimeParts.push('⏱ ' + info.epRuntime + 'min');
  else if (info.duration) runtimeParts.push('⏱ ' + info.duration);
  if (info.seasons)    runtimeParts.push('🗓 ' + info.seasons);
  if (runtimeParts.length) lines.push(runtimeParts.join('  '));

  // Episode name (TV only)
  if (info.epName) lines.push('📌 ' + info.epName);

  lines.push("by Sanchit · @S4NCHITT · Murph's Streams");

  return {
    name    : streamName,
    title   : lines.join('\n'),
    url     : url,
    quality : quality,
    behaviorHints: {
      notWebReady: false,
      bingeGroup : 'streamflix',
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Movie handler — identical logic to v3.1, enriched Nuvio output
// ─────────────────────────────────────────────────────────────────────────────

function doMovie(item, config, tmdbTitle, langOverride) {
  var link = getLink(item), name = getTitle(item);
  console.log(TAG + ' Movie: "' + name + '" link="' + link + '"');
  if (!link) return Promise.resolve([]);

  var cdnTiers = tiers(config);
  if (!Object.keys(cdnTiers).length) return Promise.resolve([]);

  // Get all audio languages from the item (array)
  var langs = langOverride ? (Array.isArray(langOverride) ? langOverride : [langOverride]) : getAllLangsFromItem(item);
  var langLabel = langs.join(' + ');

  // ── Extract info from data.json item fields ────────────────────────────────
  var genre    = item.moviegenre    || item.genre        || item.Genre       || null;
  var duration = item.movieduration || item.duration     || item.Duration    || null;
  var imdb     = item.imdbrating    || item.imdb_rating  || item.ImdbRating  || null;
  var year     = item.movieyear     || item.year         || item.Year        || null;

  if (genre    && typeof genre    === 'string') genre    = genre.replace(/\|/g, ' · ').trim();
  if (duration && typeof duration === 'string' && /[Ss]eason/.test(duration)) duration = null;
  if (imdb     && typeof imdb     === 'number') imdb     = imdb.toFixed(1);

  var titleLine = (tmdbTitle || name) + (year ? ' (' + year + ')' : '');
  var info = { genre: genre, duration: duration, imdb: imdb };

  var checks = Object.keys(cdnTiers).map(function (q) {
    return pickMirror(cdnTiers[q], link).then(function (url) { return { q: q, url: url }; });
  });

  return Promise.all(checks).then(function (resolved) {
    var seen = {}, streams = [];
    resolved.forEach(function (r) {
      if (!r.url || seen[r.url]) return;
      seen[r.url] = true;
      streams.push(makeStream(r.url, r.q, titleLine, langs, info));
    });
    console.log(TAG + ' ' + streams.length + ' movie stream(s)');
    return streams;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TV handler — identical logic to v3.1, Nuvio output
// ─────────────────────────────────────────────────────────────────────────────

function doTV(item, config, s, e, tmdbTitle, langOverride) {
  var key  = getKey(item), name = getTitle(item);
  console.log(TAG + ' TV: "' + name + '" key="' + key + '" S' + s + 'E' + e);

  // ── Extract info from item fields ──────────────────────────────────────────
  var _genre    = item.moviegenre    || item.genre       || item.Genre      || null;
  var _imdb     = item.imdbrating    || item.imdb_rating || item.ImdbRating || null;
  var _year     = item.movieyear     || item.year        || item.Year       || null;
  var _seasons  = null;
  var _dur      = item.movieduration || item.duration    || item.Duration   || null;
  if (_genre  && typeof _genre  === 'string') _genre  = _genre.replace(/\|/g, ' · ').trim();
  if (_imdb   && typeof _imdb   === 'number') _imdb   = _imdb.toFixed(1);
  // Extract season count e.g. "3 Seasons" — keep for display
  if (_dur && typeof _dur === 'string') {
    var _sm = _dur.match(/(\d+)\s*[Ss]easons?/);
    if (_sm) { _seasons = _sm[1] + ' Season' + (parseInt(_sm[1]) > 1 ? 's' : ''); }
  }

  var epSuffix   = ' S' + String(s).padStart(2, '0') + 'E' + String(e).padStart(2, '0');
  var displayTitle = (tmdbTitle || name) + (_year ? ' (' + _year + ')' : '') + epSuffix;

  var cdnTiers = tiers(config);
  if (!Object.keys(cdnTiers).length) return Promise.resolve([]);

  // Total seasons from movieduration field — identical to v3.1
  var durationStr  = item.movieduration || item.duration || '';
  var seasonMatch  = String(durationStr).match(/(\d+)\s*[Ss]eason/);
  var totalSeasons = seasonMatch ? parseInt(seasonMatch[1]) : s;

  // Get all audio languages from the item (array)
  var langs = langOverride ? (Array.isArray(langOverride) ? langOverride : [langOverride]) : getAllLangsFromItem(item);
  var langLabel = langs.join(' + ');

  // Step 1: try single-season WS, fall back to multi-season
  var epLinkPromise;
  if (key) {
    epLinkPromise = wsEpisodes(key, s)
      .then(function (eps) {
        console.log(TAG + ' WS ep keys for S' + s + ': [' + Object.keys(eps).join(',') + ']');
        var ep = eps[e - 1]; // 0-indexed — same as v3.1
        if (ep && ep.link) { console.log(TAG + ' WS link: ' + ep.link); return ep; }
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
              if (ep && ep.link) { console.log(TAG + ' Multi-season WS link: ' + ep.link); return ep; }
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

  // epData passed through from WS for episode name/runtime
  var _epData = null;

  return epLinkPromise.then(function (result) {
    var epLink = result && result.link !== undefined ? result.link : result;
    var _epName    = (result && result.name)    || null;
    var _epRuntime = (result && result.runtime) || null;
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
            .map(function (q) { return makeStream(cdnTiers[q][0] + fp, q, displayTitle, langs, { genre: _genre, imdb: _imdb, seasons: _seasons, epName: _epName, epRuntime: _epRuntime }); });
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
          streams.push(makeStream(r.url, r.q, displayTitle, langs, { genre: _genre, imdb: _imdb, seasons: _seasons, epName: _epName, epRuntime: _epRuntime }));
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

      // findAllContent returns every language variant (Hindi, Tamil, Telugu, etc.)
      return findAllContent(title).then(function (candidates) {
        if (!candidates.length) return [];

        console.log(TAG + ' Processing ' + candidates.length + ' language variant(s) in parallel');

        // Run doMovie / doTV for every variant simultaneously
        var variantPromises = candidates.map(function (c) {
          // Pass the full langs array so doMovie/doTV can show "Hindi + Tamil + Telugu"
          var p = isTv
            ? doTV(c.item, config, parseInt(sNum), parseInt(eNum), title, c.langs)
            : doMovie(c.item, config, title, c.langs);
          return p.catch(function (err) {
            console.log(TAG + ' Variant "' + c.rawTitle + '" failed: ' + err.message);
            return [];
          });
        });

        return Promise.all(variantPromises).then(function (allStreams) {
          // Flatten + deduplicate by URL
          var seen = {}, streams = [];
          for (var i = 0; i < allStreams.length; i++) {
            for (var j = 0; j < allStreams[i].length; j++) {
              var s = allStreams[i][j];
              if (!s || !s.url || seen[s.url]) continue;
              seen[s.url] = true;
              streams.push(s);
            }
          }

          // Sort: multi-audio (≥2 langs) first, then by primary lang, then quality desc
          var LANG_ORDER = { Hindi:0, Tamil:1, Telugu:2, Kannada:3, Malayalam:4, Bengali:5, Punjabi:6, English:7 };
          streams.sort(function (a, b) {
            // Extract lang string from name e.g. "🎬 StreamFlix | 1080p | Hindi + Tamil"
            // The lang part is after the last " | "
            var lastPipeA = (a.name || '').lastIndexOf(' | ');
            var lastPipeB = (b.name || '').lastIndexOf(' | ');
            var langStrA  = lastPipeA !== -1 ? (a.name || '').slice(lastPipeA + 3).trim() : '';
            var langStrB  = lastPipeB !== -1 ? (b.name || '').slice(lastPipeB + 3).trim() : '';

            // Multi-audio (contains "+") sorts before single-lang
            var aIsMulti = langStrA.indexOf('+') !== -1;
            var bIsMulti = langStrB.indexOf('+') !== -1;
            if (aIsMulti && !bIsMulti) return -1;
            if (!aIsMulti && bIsMulti) return  1;

            // Same multi/single category — sort by primary language
            var priA = langStrA.split('+')[0].trim();
            var priB = langStrB.split('+')[0].trim();
            var lo = (LANG_ORDER[priA] !== undefined ? LANG_ORDER[priA] : 99)
                   - (LANG_ORDER[priB] !== undefined ? LANG_ORDER[priB] : 99);
            if (lo !== 0) return lo;

            // Same lang — higher quality first
            var qa = parseInt(((a.quality || '0').match(/\d+/) || ['0'])[0]);
            var qb = parseInt(((b.quality || '0').match(/\d+/) || ['0'])[0]);
            return qb - qa;
          });

          console.log(TAG + ' Total: ' + streams.length + ' stream(s) across all languages');
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