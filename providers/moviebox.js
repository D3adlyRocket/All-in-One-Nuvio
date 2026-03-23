/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                      MovieBox — Nuvio Stream Plugin                         ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Source     › https://themoviebox.org                                       ║
 * ║  Worker     › https://moviebox.s4nch1tt.workers.dev                         ║
 * ║  Author     › Sanchit  |  TG: @S4NCHITT                                     ║
 * ║  Project    › Murph's Streams                                                ║
 * ║  Manifest   › https://badboysxs-morpheus.hf.space/manifest.json             ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Mode       › Calls Cloudflare Worker API directly                          ║
 * ║  Proxy      › Always uses proxy_url from worker (browser-safe, Range-ready) ║
 * ║  Speed      › Single API call — no scraping, no Nuxt parsing                ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

var WORKER_BASE = 'https://moviebox.s4nch1tt.workers.dev';
var TAG         = '[MovieBox]';

// ─────────────────────────────────────────────────────────────────────────────
// Simple LRU Cache
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

var _cache = new Cache(300, 20 * 60 * 1000); // 20 min

// ─────────────────────────────────────────────────────────────────────────────
// Worker API call
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch streams from the Cloudflare Worker.
 * Always passes proxy=WORKER_BASE so every stream has a proxy_url.
 *
 * Endpoint: /streams?tmdb_id=&type=&se=&ep=&proxy=
 * Response: { streams: [ { name, title, url, proxy_url, resolution, codec, size_mb, ... } ] }
 */
function fetchFromWorker(tmdbId, mediaType, se, ep) {
  var url = WORKER_BASE + '/streams'
    + '?tmdb_id=' + encodeURIComponent(tmdbId)
    + '&type='    + encodeURIComponent(mediaType)
    + '&proxy='   + encodeURIComponent(WORKER_BASE);

  if (mediaType === 'tv') {
    url += '&se=' + (se  != null ? se  : 1);
    url += '&ep=' + (ep  != null ? ep  : 1);
  }

  console.log(TAG + ' Worker → ' + url);

  return fetch(url, {
    headers  : { 'Accept': 'application/json', 'User-Agent': 'Nuvio/1.0' },
    redirect : 'follow',
  })
    .then(function (r) {
      if (!r.ok) throw new Error('Worker HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      // Worker returns { streams: [...] } or array directly
      if (Array.isArray(data))              return data;
      if (data && Array.isArray(data.streams)) return data.streams;
      return [];
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream Builder
// Worker already returns name/title/url/proxy_url/resolution/codec/size_mb
// We reformat into Nuvio stream objects using proxy_url as the stream URL
// ─────────────────────────────────────────────────────────────────────────────

function buildStream(s, isTv, se, ep) {
  // Always use proxy_url — worker supports Range headers, browser-safe
  var streamUrl = s.proxy_url || s.url || '';
  if (!streamUrl) return null;

  // Quality label
  var quality = 'Auto';
  if (s.resolution) {
    var m = String(s.resolution).match(/(\d+)/);
    quality = m ? m[1] + 'p' : String(s.resolution);
  }

  // Language — worker puts it in name like "MovieBox (Hindi) - 1080p"
  var lang = 'Original';
  var langMatch = (s.name || '').match(/\(([^)]+)\)/);
  if (langMatch) lang = langMatch[1];

  // ── Stream name (picker row) ───────────────────────────────────────────────
  var streamName = '📺 MovieBox | ' + quality + ' | ' + lang;

  // ── Stream title lines ────────────────────────────────────────────────────
  var titleBase = (s.title || '').split(' S0')[0].split(' S1')[0].trim(); // strip ep suffix
  var epTag = '';
  if (isTv && se != null && ep != null) {
    epTag = ' · S' + String(se).padStart(2, '0') + 'E' + String(ep).padStart(2, '0');
  }

  var lines = [];
  lines.push((titleBase || 'MovieBox') + epTag);

  var techLine = '📺 ' + quality + '  🔊 ' + lang;
  if (s.codec) techLine += '  🎞 ' + s.codec;
  if (s.format) techLine += '  [' + s.format + ']';
  lines.push(techLine);

  var metaLine = '';
  if (s.size_mb && s.size_mb > 0) metaLine += '💾 ' + s.size_mb + ' MB';
  if (s.duration_s) {
    var mins = Math.round(s.duration_s / 60);
    metaLine += (metaLine ? '  ' : '') + '⏱ ' + mins + 'min';
  }
  if (metaLine) lines.push(metaLine);

  lines.push("by Sanchit · @S4NCHITT · Murph's Streams");

  return {
    name    : streamName,
    title   : lines.join('\n'),
    url     : streamUrl,    // proxy_url from worker — Range-ready, no extra headers needed
    quality : quality,
    behaviorHints: {
      bingeGroup  : 'moviebox',
      notWebReady : false,
    },
    subtitles: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getStreams — main Nuvio export
// ─────────────────────────────────────────────────────────────────────────────

function getStreams(tmdbId, type, season, episode) {
  var mediaType = (type === 'series') ? 'tv' : (type || 'movie');
  var isTv      = mediaType === 'tv';
  var se        = isTv ? (season  ? parseInt(season)  : 1) : null;
  var ep        = isTv ? (episode ? parseInt(episode) : 1) : null;

  var cacheKey = 'mb_' + tmdbId + '_' + mediaType + '_' + se + '_' + ep;
  var cached   = _cache.get(cacheKey);
  if (cached) { console.log(TAG + ' Cache HIT: ' + cacheKey); return Promise.resolve(cached); }

  console.log(TAG + ' ► ' + tmdbId + ' | ' + mediaType + (isTv ? ' S' + se + 'E' + ep : ''));

  return fetchFromWorker(tmdbId, mediaType, se, ep)
    .then(function (rawStreams) {
      if (!rawStreams.length) {
        console.log(TAG + ' No streams from worker');
        return [];
      }

      console.log(TAG + ' Worker returned ' + rawStreams.length + ' stream(s)');

      var streams = rawStreams
        .map(function (s) { return buildStream(s, isTv, se, ep); })
        .filter(Boolean);

      // Sort highest resolution first
      streams.sort(function (a, b) {
        var pa = parseInt((a.quality || '').match(/\d+/) || [0]);
        var pb = parseInt((b.quality || '').match(/\d+/) || [0]);
        if (pb !== pa) return pb - pa;
        // Auto floats to top
        if (a.quality === 'Auto') return -1;
        if (b.quality === 'Auto') return 1;
        return 0;
      });

      console.log(TAG + ' ✔ ' + streams.length + ' stream(s) ready');
      if (streams.length) _cache.set(cacheKey, streams);
      return streams;
    })
    .catch(function (e) {
      console.error(TAG + ' Fatal: ' + e.message);
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