// ================================================================
// ZoroLost — WatchAnimeWorld India Provider for Nuvio
// ================================================================
// Site     : https://watchanimeworld.net
// Server 1 : MultiCloud (Zephyrflick) — scraped ✅
// Server 2 : Abyss (P2P/WebSocket)   — not scrapable ❌ skipped
// Engine   : Hermes (React Native)   — NO async/await, .then() only
// Author   : Kabir (PirateZoro9)
// ================================================================
// 🔑 TMDB KEY — get your FREE key at https://www.themoviedb.org/settings/api
// Replace the value below with your own key. Never share this file
// publicly with a real key inside it.
// ================================================================

var TMDB_KEY = 'd80ba92bc7cefe3359668d30d06f3305'
var BASE     = 'https://watchanimeworld.net'
var PLAYER   = 'https://play.zephyrflick.top'
var UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// ── Timeout helper ────────────────────────────────────────────────
// If the entire scrape chain takes longer than ms milliseconds,
// we bail out cleanly — the app never hangs waiting for us.

function withTimeout(promise, ms) {
  var killer = new Promise(function(_, reject) {
    setTimeout(function() {
      reject(new Error('[ZoroLost] Timed out after ' + ms + 'ms'))
    }, ms)
  })
  return Promise.race([promise, killer])
}

// ── HTTP helpers ──────────────────────────────────────────────────

function httpGet(url, extra) {
  return fetch(url, {
    headers: Object.assign({ 'User-Agent': UA }, extra || {})
  }).then(function(r) {
    if (!r.ok) throw new Error('GET ' + r.status + ' → ' + url)
    return r.text()
  })
}

function httpPost(url, body, extra) {
  return fetch(url, {
    method: 'POST',
    headers: Object.assign({
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded'
    }, extra || {}),
    body: body
  }).then(function(r) {
    if (!r.ok) throw new Error('POST ' + r.status + ' → ' + url)
    return r.json()
  })
}

// ── Title scoring ─────────────────────────────────────────────────

function cleanStr(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreMatch(slug, query, itemYear, year) {
  // Turn slug back into words: "jujutsu-kaisen-2023" → "jujutsu kaisen"
  var slugTitle = slug.replace(/-/g, ' ').replace(/\d{4}$/, '').trim()
  var c = cleanStr(slugTitle)
  var q = cleanStr(query)
  var s = 0
  if (c === q)                          s += 100  // exact
  else if (c.indexOf(q) === 0)          s += 70   // starts with
  else if (c.indexOf(q) >= 0)           s += 40   // contains
  if (year && itemYear) {
    if (itemYear === year)               s += 20
    else if (Math.abs(itemYear-year)<=1) s += 10
    else                                 s -= 15
  }
  s -= Math.floor(slugTitle.length / 8) // penalise long slugs
  return s
}

// ── Step 1 : Search the site ──────────────────────────────────────

function searchSite(title, mediaType, year) {
  var url = BASE + '/?s=' + encodeURIComponent(title)
  console.log('[ZoroLost] Searching: ' + url)

  return httpGet(url, { Referer: BASE + '/' })
    .then(function(html) {
      var results = []
      var re = /href="(https:\/\/watchanimeworld\.net\/(series|movies)\/([^\/\"]+)\/)"/g
      var m
      while ((m = re.exec(html)) !== null) {
        var link = m[1], type = m[2], slug = m[3]
        if (!slug || slug === 'page') continue
        // Deduplicate by slug
        var dup = false
        for (var i = 0; i < results.length; i++) {
          if (results[i].slug === slug) { dup = true; break }
        }
        if (dup) continue
        // Year from slug suffix e.g. "demon-slayer-2019"
        var ym = slug.match(/-(\d{4})$/)
        var itemYear = ym ? parseInt(ym[1]) : null
        results.push({ url: link, type: type, slug: slug, year: itemYear })
      }

      console.log('[ZoroLost] Raw results: ' + results.length)

      // Filter by content type first
      var typed = results
      if (mediaType === 'movie') {
        var movies = results.filter(function(r) { return r.type === 'movies' })
        if (movies.length) typed = movies
      } else {
        var series = results.filter(function(r) { return r.type === 'series' })
        if (series.length) typed = series
      }

      // Sort by best title + year match
      typed.sort(function(a, b) {
        return scoreMatch(b.slug, title, b.year, year) -
               scoreMatch(a.slug, title, a.year, year)
      })

      if (typed.length) {
        console.log('[ZoroLost] Best match: ' + typed[0].slug +
          ' (score ' + scoreMatch(typed[0].slug, title, typed[0].year, year) + ')')
      }
      return typed
    })
}

// ── Step 2 : Get the right episode URL ───────────────────────────

function getEpisodeUrl(seriesUrl, season, episode) {
  console.log('[ZoroLost] Series page: ' + seriesUrl)

  return httpGet(seriesUrl, { Referer: BASE + '/' })
    .then(function(html) {
      // Post ID is in class="postid-NNN" — confirmed from HAR analysis
      var pidM = html.match(/postid-(\d+)/)
      if (!pidM) pidM = html.match(/data-post="(\d+)"/)
      if (!pidM) {
        console.log('[ZoroLost] No post ID found on series page')
        return null
      }
      var postId = pidM[1]
      console.log('[ZoroLost] Post ID: ' + postId + ' | Fetching season ' + season)

      // Confirmed from HAR: this is a GET request, not POST
      var ajaxUrl = BASE + '/wp-admin/admin-ajax.php' +
        '?action=action_select_season&season=' + season + '&post=' + postId

      return httpGet(ajaxUrl, { Referer: seriesUrl })
        .then(function(epHtml) {
          return findEpisodeLink(epHtml, season, episode)
        })
    })
}

function findEpisodeLink(html, season, episode) {
  // Trailing slash is the exact word boundary.
  // "1x1/" will NEVER match "1x10/" or "1x11/" — this was the critical bug.
  var suffix = season + 'x' + episode + '/'
  var re = /href="(https:\/\/watchanimeworld\.net\/episode\/([^"]+))"/g
  var m
  while ((m = re.exec(html)) !== null) {
    var fullUrl = m[1]
    if (fullUrl.slice(-suffix.length) === suffix) {
      console.log('[ZoroLost] ✅ Episode URL: ' + fullUrl)
      return fullUrl
    }
  }
  console.log('[ZoroLost] Episode S' + season + 'E' + episode + ' not found in list')
  return null
}

// ── Step 3 : Extract stream from the episode/movie page ──────────

function getStreamFromPage(pageUrl) {
  console.log('[ZoroLost] Page: ' + pageUrl)

  return httpGet(pageUrl, { Referer: BASE + '/' })
    .then(function(html) {
      // Matches src= AND data-src= (lazy-load safe) — confirmed from HAR
      var iframeM = html.match(
        /(?:src|data-src)="(https:\/\/play\.zephyrflick\.top\/video\/([a-f0-9]+))"/
      )
      if (!iframeM) {
        console.log('[ZoroLost] Zephyrflick player not found — may be Abyss-only content')
        return null
      }

      var videoHash = iframeM[2]
      console.log('[ZoroLost] Video hash: ' + videoHash)

      // Confirmed from HAR: POST body = hash + referer
      return httpPost(
        PLAYER + '/player/index.php?data=' + videoHash + '&do=getVideo',
        'hash=' + videoHash + '&r=' + encodeURIComponent(BASE + '/'),
        {
          Referer:             PLAYER + '/',
          Origin:              PLAYER,
          'X-Requested-With': 'XMLHttpRequest'
        }
      ).then(function(data) {
        var m3u8 = data.videoSource || data.securedLink
        if (!m3u8) {
          console.log('[ZoroLost] Player returned no stream URL')
          return null
        }

        // IMPORTANT: Content hash ≠ video hash.
        // Content hash lives inside the m3u8 path — confirmed from HAR.
        // e.g. play.zephyrflick.top/cdn/hls/332df7c.../master.m3u8
        var contentHashM = m3u8.match(/\/cdn\/hls\/([a-f0-9]+)\//)
        var contentHash  = contentHashM ? contentHashM[1] : videoHash

        // Subtitle CDN domain extracted from videoImage — confirmed from HAR.
        // e.g. "https://s7.as-cdn17.top/cdn/down/.../thumb.jpg"
        var subCdn = PLAYER
        if (data.videoImage) {
          var cdnM = data.videoImage.match(/^(https:\/\/[^\/]+)/)
          if (cdnM) subCdn = cdnM[1]
        }

        var subtitleUrl = subCdn + '/cdn/down/' + contentHash + '/Subtitle/subtitle_eng.srt'
        console.log('[ZoroLost] ✅ Stream ready | contentHash: ' + contentHash)

        return {
          m3u8:        m3u8,
          subtitleUrl: subtitleUrl
        }
      })
    })
}

// ── Main export ───────────────────────────────────────────────────

function getStreams(tmdbId, mediaType, season, episode) {
  return new Promise(function(resolve) {
    console.log('[ZoroLost] ▶ START | tmdbId:' + tmdbId +
      ' | type:' + mediaType + ' | S' + season + 'E' + episode)

    var chain = fetch(
      'https://api.themoviedb.org/3/' +
      (mediaType === 'movie' ? 'movie' : 'tv') +
      '/' + tmdbId + '?api_key=' + TMDB_KEY
    )
    .then(function(r) { return r.json() })
    .then(function(meta) {
      var title = meta.title || meta.name
      if (!title) throw new Error('TMDB returned no title for id ' + tmdbId)
      var dateStr = meta.release_date || meta.first_air_date || ''
      var year = dateStr ? parseInt(dateStr.split('-')[0]) : null
      console.log('[ZoroLost] TMDB: "' + title + '" (' + year + ')')
      return searchSite(title, mediaType, year)
    })
    .then(function(results) {
      if (!results || results.length === 0) {
        console.log('[ZoroLost] No search results — resolving empty')
        resolve([])
        return null
      }
      var best = results[0]
      console.log('[ZoroLost] Using: ' + best.url)

      if (mediaType === 'movie') {
        return getStreamFromPage(best.url)
      }
      return getEpisodeUrl(best.url, season, episode)
        .then(function(epUrl) {
          if (!epUrl) { resolve([]); return null }
          return getStreamFromPage(epUrl)
        })
    })
    .then(function(streamData) {
      if (!streamData) { resolve([]); return }

      resolve([{
        name:        '🗡️ ZoroLost',

        // ✅ All 5 audio languages listed — works with Nuvio language filter
        title:       '🇮🇳 Hindi • Tamil • Telugu • English • Japanese',

        // ✅ Description field — shown in stream card, kept under 200 chars
        description: 'WatchAnimeWorld India | Multi-Audio 1080p | Zephyrflick',

        url:         streamData.m3u8,
        quality:     '1080p',

        behaviorHints: {
          // ✅ bingeGroup — Nuvio auto-selects next episode stream automatically.
          // Any episode with the same bingeGroup string skips the stream picker.
          bingeGroup: 'zorolost-1080p',

          // ✅ proxyHeaders — the correct way to pass playback headers.
          // Survives external player handoff (MX Player, VLC) and casting.
          proxyHeaders: {
            request: {
              Referer:      PLAYER + '/',
              Origin:       PLAYER,
              'User-Agent': UA
            }
          }
        },

        subtitles: streamData.subtitleUrl
          ? [{ url: streamData.subtitleUrl, lang: 'en', name: 'English' }]
          : []
      }])
    })
    .catch(function(err) {
      console.error('[ZoroLost] ERROR: ' + err.message)
      resolve([])
    })

    // ✅ 8-second hard timeout — resolves empty if site is too slow or down
    withTimeout(chain, 8000).catch(function(err) {
      console.error(err.message)
      resolve([])
    })
  })
}

module.exports = { getStreams }
