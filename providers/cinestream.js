/**
 * CineStream Provider untuk Nuvio Mobile
 * Dibangun menggunakan pola yang sama dengan VideoEasy (works)
 *
 * Pelajaran dari Videasy:
 * 1. Pakai API endpoint yang return JSON langsung — BUKAN scraping HTML
 * 2. Jika response terenkripsi → dekripsi via enc-dec.app
 * 3. TMDB → ambil title + imdbId dalam satu request (append_to_response)
 * 4. Dedup + sort kualitas sebelum return
 *
 * Sources yang digunakan (semua clean JSON API):
 * - Videasy (10 servers) — sama persis dengan plugin Videasy yang works
 * - Stremio addons: Streamvix, NoTorrent (JSON /stream endpoint)
 * - VidSrc JSON API
 */

var TMDB_API_KEY  = '1865f43a0549ca50d341dd9ab8b29f49';
var DECRYPT_API   = 'https://enc-dec.app/api/dec-videasy';
var STREAMVIX_API = 'https://streamvix.hayd.uk';
var NOTORRENT_API = 'https://addon-osvh.onrender.com';
var VIDSRC_API    = 'https://api.rgshows.ru';
var FETCH_TIMEOUT = 12000;

var HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://player.videasy.net',
  'Referer': 'https://player.videasy.net/'
};

// ─── Videasy servers (sama persis dari plugin Videasy yang works) ──────────────
var VIDEASY_SERVERS = [
  { name: 'Neon',   url: 'https://api.videasy.net/myflixerzupcloud/sources-with-title', tvOk: true },
  { name: 'Cypher', url: 'https://api.videasy.net/moviebox/sources-with-title',         tvOk: true },
  { name: 'Reyna',  url: 'https://api.videasy.net/primewire/sources-with-title',        tvOk: true },
  { name: 'Omen',   url: 'https://api.videasy.net/onionplay/sources-with-title',        tvOk: true },
  { name: 'Breach', url: 'https://api.videasy.net/m4uhd/sources-with-title',            tvOk: true },
  { name: 'Ghost',  url: 'https://api.videasy.net/primesrcme/sources-with-title',       tvOk: true },
  { name: 'Sage',   url: 'https://api.videasy.net/1movies/sources-with-title',          tvOk: true },
  { name: 'Vyse',   url: 'https://api.videasy.net/hdmovie/sources-with-title',          tvOk: true },
  { name: 'Raze',   url: 'https://api.videasy.net/superflix/sources-with-title',        tvOk: true },
  { name: 'Yoru',   url: 'https://api.videasy.net/cdn/sources-with-title',              tvOk: false } // movie only
];

var QUALITY_ORDER = { '4K': 6, '2160p': 6, '1080p': 5, '720p': 4, '576p': 3, '480p': 2, '360p': 1, 'Auto': 0 };

// ─── Fetch dengan timeout ─────────────────────────────────────────────────────
function fetchTimeout(url, options, ms) {
  ms = ms || FETCH_TIMEOUT;
  return Promise.race([
    fetch(url, options),
    new Promise(function(_, rej) {
      setTimeout(function() { rej(new Error('Timeout')); }, ms);
    })
  ]);
}

function safeText(url, options) {
  return fetchTimeout(url, options || {}).then(function(r) { return r.text(); }).catch(function() { return ''; });
}

function safeJson(url, options) {
  return fetchTimeout(url, options || {}).then(function(r) { return r.json(); }).catch(function() { return null; });
}

// ─── Dedup + sort kualitas (sama dengan Videasy) ──────────────────────────────
function dedupAndSort(streams) {
  var seen = {};
  var unique = streams.filter(function(s) {
    if (!s || !s.url) return false;
    var key = s.url + '|' + s.quality;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
  unique.sort(function(a, b) {
    return (QUALITY_ORDER[b.quality] || 0) - (QUALITY_ORDER[a.quality] || 0);
  });
  return unique;
}

// ─── Step 1: Ambil info dari TMDB (satu request, append external_ids) ─────────
// Sama persis dengan Videasy
function getTmdbInfo(tmdbId, isMovie) {
  var type = isMovie ? 'movie' : 'tv';
  var url = 'https://api.themoviedb.org/3/' + type + '/' + tmdbId +
            '?api_key=' + TMDB_API_KEY + '&append_to_response=external_ids';

  return fetchTimeout(url, {}, 8000)
    .then(function(r) {
      if (!r.ok) throw new Error('TMDB gagal: ' + r.status);
      return r.json();
    })
    .then(function(data) {
      var title = data.title || data.name;
      if (!title) throw new Error('Judul tidak ditemukan di TMDB');

      var imdbFull = (data.external_ids && data.external_ids.imdb_id) || '';
      var imdbClean = imdbFull.startsWith('tt') ? imdbFull.slice(2) : imdbFull;

      return {
        id: String(tmdbId),
        title: title,
        year: (data.release_date || data.first_air_date || '').split('-')[0],
        imdbId: imdbClean,       // tanpa "tt" prefix — untuk Videasy
        imdbIdFull: imdbFull,    // dengan "tt" prefix — untuk Stremio & VidSrc
        type: isMovie ? 'movie' : 'tv'
      };
    });
}

// ─── Source 1: Videasy servers (pola identik dengan plugin Videasy) ───────────
function invokeVideasy(info, isMovie, season, episode, allStreams) {
  var tasks = VIDEASY_SERVERS.map(function(server) {
    return function() {
      // Skip server movie-only jika ini TV
      if (!isMovie && !server.tvOk) return Promise.resolve();

      var url = server.url +
        '?title='     + encodeURIComponent(info.title) +
        '&mediaType=' + info.type +
        '&year='      + info.year +
        '&tmdbId='    + info.id +
        '&imdbId='    + info.imdbId;

      if (!isMovie) {
        url += '&seasonId=' + season + '&episodeId=' + episode;
      }

      return safeText(url, { headers: HEADERS })
        .then(function(encText) {
          if (!encText || encText.length < 20 || encText.startsWith('<!')) return;

          return fetchTimeout(DECRYPT_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: encText, id: info.id })
          })
          .then(function(r) { return r.json(); })
          .then(function(dec) {
            var data = dec.result || dec;
            if (!data || !Array.isArray(data.sources)) return;

            data.sources.forEach(function(s) {
              if (!s.url) return;
              allStreams.push({
                name: 'CineStream',
                title: 'Videasy ' + server.name + ' [' + (s.quality || 'Auto') + ']',
                url: s.url,
                quality: s.quality || 'Auto',
                headers: {
                  'Referer': 'https://player.videasy.net/',
                  'Origin': 'https://player.videasy.net',
                  'User-Agent': HEADERS['User-Agent']
                },
                provider: 'videasy_' + server.name.toLowerCase()
              });
            });
          });
        })
        .catch(function(e) {
          console.error('[CineStream] Videasy ' + server.name + ' error: ' + e.message);
        });
    };
  });

  return runLimited(tasks, 4);
}

// ─── Source 2: Stremio addon (Streamvix + NoTorrent) — clean JSON API ─────────
// Format: /stream/movie/{imdbId}.json atau /stream/series/{imdbId}:{s}:{e}.json
function invokeStremio(name, baseUrl, imdbIdFull, isMovie, season, episode, allStreams) {
  if (!imdbIdFull) return Promise.resolve();

  var path = isMovie
    ? '/stream/movie/' + imdbIdFull + '.json'
    : '/stream/series/' + imdbIdFull + '%3A' + season + '%3A' + episode + '.json';

  return safeJson(baseUrl.replace(/\/$/, '') + path)
    .then(function(data) {
      if (!data || !Array.isArray(data.streams)) return;
      data.streams.forEach(function(s) {
        if (!s.url) return;
        var q = detectQuality(s.name || s.title || '');
        allStreams.push({
          name: 'CineStream',
          title: name + ' [' + q + ']',
          url: s.url,
          quality: q,
          headers: (s.behaviorHints && s.behaviorHints.headers) || { 'Referer': baseUrl }
        });
      });
    })
    .catch(function() {});
}

// ─── Source 3: VidSrc JSON API ────────────────────────────────────────────────
function invokeVidSrc(imdbIdFull, isMovie, season, episode, allStreams) {
  if (!imdbIdFull) return Promise.resolve();

  var url = isMovie
    ? VIDSRC_API + '/api/v2/embed/movie?imdb_id=' + imdbIdFull
    : VIDSRC_API + '/api/v2/embed/tv?imdb_id=' + imdbIdFull + '&season=' + season + '&episode=' + episode;

  return safeJson(url)
    .then(function(data) {
      if (!data) return;
      var sources = (data.result && data.result.sources) || data.sources || [];
      sources.forEach(function(s) {
        if (!s.url) return;
        allStreams.push({
          name: 'CineStream',
          title: 'VidSrc [' + (s.quality || 'Auto') + ']',
          url: s.url,
          quality: s.quality || 'Auto',
          headers: { 'Referer': VIDSRC_API + '/' }
        });
      });
    })
    .catch(function() {});
}

// ─── Quality detector ─────────────────────────────────────────────────────────
function detectQuality(str) {
  str = String(str || '');
  if (str.indexOf('4K') !== -1 || str.indexOf('2160') !== -1) return '4K';
  if (str.indexOf('1080') !== -1) return '1080p';
  if (str.indexOf('720') !== -1)  return '720p';
  if (str.indexOf('480') !== -1)  return '480p';
  if (str.indexOf('360') !== -1)  return '360p';
  return 'Auto';
}

// ─── Concurrency runner ───────────────────────────────────────────────────────
function runLimited(tasks, limit) {
  var i = 0;
  function next() {
    if (i >= tasks.length) return Promise.resolve();
    var fn = tasks[i++];
    return fn().catch(function() {}).then(next);
  }
  var workers = [];
  for (var w = 0; w < Math.min(limit, tasks.length); w++) workers.push(next());
  return Promise.all(workers);
}

// ─── getStreams — entry point dipanggil Nuvio ─────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  var isMovie = mediaType !== 'tv';

  if (!tmdbId) {
    console.error('[CineStream] tmdbId tidak boleh kosong');
    return Promise.resolve([]);
  }
  if (!isMovie && (season == null || episode == null)) {
    console.error('[CineStream] season/episode wajib untuk TV');
    return Promise.resolve([]);
  }

  console.log('[CineStream] ' + mediaType + ' tmdbId=' + tmdbId +
    (isMovie ? '' : ' S' + season + 'E' + episode));

  var allStreams = [];

  // Step 1: Info dari TMDB
  return getTmdbInfo(tmdbId, isMovie)
    .then(function(info) {
      console.log('[CineStream] "' + info.title + '" (' + info.year + ') imdb=' + (info.imdbIdFull || 'none'));

      // Step 2: Jalankan semua sources secara parallel
      return Promise.all([
        // Videasy 10 servers (concurrency 4)
        invokeVideasy(info, isMovie, season, episode, allStreams),

        // Stremio addons (JSON langsung)
        invokeStremio('Streamvix', STREAMVIX_API, info.imdbIdFull, isMovie, season, episode, allStreams),
        invokeStremio('NoTorrent', NOTORRENT_API, info.imdbIdFull, isMovie, season, episode, allStreams),

        // VidSrc JSON API
        invokeVidSrc(info.imdbIdFull, isMovie, season, episode, allStreams)
      ]);
    })
    .then(function() {
      var result = dedupAndSort(allStreams);
      console.log('[CineStream] Selesai — ' + result.length + ' stream ditemukan');
      return result;
    })
    .catch(function(err) {
      console.error('[CineStream] Error: ' + (err.message || err));
      return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
}
