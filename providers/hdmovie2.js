// HDMovie2 Provider for Nuvio
// Bollywood + Hollywood Hindi Dubbed + Web Series
// NO async/await! Only .then() chains!

var TMDB_KEY = 'd80ba92bc7cefe3359668d30d06f3305'
var BASE = 'https://hdmovie2.equipment'
var CDN = 'https://hdm2.ink'
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'

function httpGet(url, headers) {
  return fetch(url, {
    headers: Object.assign({ 'User-Agent': UA }, headers || {})
  }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return r.text()
  })
}

function httpPost(url, body, headers) {
  return fetch(url, {
    method: 'POST',
    headers: Object.assign({
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded'
    }, headers || {}),
    body: body
  }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return r.text()
  })
}

function cleanTitle(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function searchSite(title, year) {
  var url = BASE + '/?s=' + encodeURIComponent(title)
  return httpGet(url, { 'Referer': BASE + '/' })
    .then(function(html) {
      var results = []
      var articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/g
      var articleMatch

      while ((articleMatch = articleRegex.exec(html)) !== null) {
        var articleHtml = articleMatch[1]
        var linkMatch = articleHtml.match(/href="(https:\/\/hdmovie2\.equipment\/movies\/([^"\/]+)\/)"/)
        if (!linkMatch) continue
        if (linkMatch[1].includes('/feed/')) continue
        var altMatch = articleHtml.match(/alt="([^"]+)"/)
        if (!altMatch) continue

        var itemUrl = linkMatch[1]
        var slug = linkMatch[2]
        var itemTitle = altMatch[1].trim()
        var yearMatch = itemTitle.match(/\((\d{4})\)/)
        var itemYear = yearMatch ? parseInt(yearMatch[1]) : null

        var exists = false
        for (var i = 0; i < results.length; i++) {
          if (results[i].slug === slug) { exists = true; break }
        }
        if (!exists && slug) {
          results.push({ url: itemUrl, slug: slug, title: itemTitle, year: itemYear })
        }
      }

      console.log('[HDMovie2] Raw: ' + results.length + ' for: ' + title + ' (' + year + ')')

      var withYear = []
      if (year) {
        withYear = results.filter(function(r) {
          return r.year && Math.abs(r.year - year) <= 1
        })
      }

      var candidates = withYear.length > 0 ? withYear : results
      if (candidates.length === 0) candidates = results

      var cleanSearch = cleanTitle(title)
      candidates.sort(function(a, b) {
        var cleanA = cleanTitle(a.title)
        var cleanB = cleanTitle(b.title)
        var exactA = cleanA === cleanSearch ? 0 : 1
        var exactB = cleanB === cleanSearch ? 0 : 1
        if (exactA !== exactB) return exactA - exactB
        var startsA = cleanA.indexOf(cleanSearch) === 0 ? 0 : 1
        var startsB = cleanB.indexOf(cleanSearch) === 0 ? 0 : 1
        if (startsA !== startsB) return startsA - startsB
        return cleanA.length - cleanB.length
      })

      if (candidates.length > 0) {
        console.log('[HDMovie2] Best: ' + candidates[0].title + ' (' + candidates[0].year + ')')
      }
      return candidates
    })
}

function getHdm2Stream(playerUrl) {
  return httpGet(playerUrl, { 'Referer': BASE + '/' })
    .then(function(html) {
      var streamMatch = html.match(/data-stream-url="([^"]+)"/)
      if (!streamMatch) {
        console.log('[HDMovie2] No data-stream-url in hdm2 page')
        return null
      }
      var streamPath = streamMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
      console.log('[HDMovie2] hdm2 stream found!')
      return {
        url: CDN + streamPath,
        headers: { 'Referer': CDN + '/', 'Origin': CDN, 'User-Agent': UA }
      }
    })
}

function getMolopStream(playerUrl) {
  return httpGet(playerUrl, { 'Referer': BASE + '/' })
    .then(function(html) {
      // Hash is 3rd param in: sniff("videoId","1","HASH",...)
      var sniffMatch = html.match(/sniff\s*\(\s*["'][^"']+["']\s*,\s*["'][^"']+["']\s*,\s*["']([a-f0-9]+)["']/)
      if (!sniffMatch) {
        console.log('[HDMovie2] No sniff hash in molop page')
        return null
      }
      var hash = sniffMatch[1]
      // Use .m3u8 extension so ExoPlayer recognizes it properly
      var m3u8Url = 'https://molop.art/m3u8/1/' + hash + '/master.m3u8?s=1&cache=1'
      console.log('[HDMovie2] molop hash: ' + hash)
      return {
        url: m3u8Url,
        headers: {
          'Referer': 'https://molop.art/',
          'Origin': 'https://molop.art',
          'User-Agent': UA
        }
      }
    })
}

function tryGetStream(postId, movieUrl) {
  var nume = 1
  var maxNume = 4

  function tryNume() {
    if (nume > maxNume) {
      console.log('[HDMovie2] All servers exhausted')
      return Promise.resolve(null)
    }

    console.log('[HDMovie2] Trying server ' + nume)
    return httpPost(
      BASE + '/wp-admin/admin-ajax.php',
      'action=doo_player_ajax&post=' + postId + '&nume=' + nume + '&type=movie',
      { 'Referer': movieUrl }
    ).then(function(body) {
      var data
      try { data = JSON.parse(body) } catch(e) { return null }

      var embedUrl = data.embed_url || ''
      if (!embedUrl) {
        console.log('[HDMovie2] Empty embed')
        return null
      }

      var cleaned = embedUrl.replace(/\\\//g, '/')
      console.log('[HDMovie2] Server ' + nume + ': ' + cleaned.substring(0, 80))

      // hdm2.ink player
      var hdm2Match = cleaned.match(/src="(https:\/\/hdm2\.ink\/play\?v=[^"]+)"/)
      if (hdm2Match) {
        return getHdm2Stream(hdm2Match[1]).then(function(s) {
          if (s) return s
          nume++; return tryNume()
        })
      }

      // molop.art player
      var molopMatch = cleaned.match(/src="(https:\/\/molop\.art\/watch\?v=[^"]+)"/)
      if (molopMatch) {
        return getMolopStream(molopMatch[1]).then(function(s) {
          if (s) return s
          nume++; return tryNume()
        })
      }

      // Skip AbyssCDN
      if (cleaned.includes('prvs.top')) {
        console.log('[HDMovie2] Skipping AbyssCDN')
        nume++; return tryNume()
      }

      // Skip ok.ru
      if (cleaned.includes('ok.ru')) {
        console.log('[HDMovie2] Skipping ok.ru')
        nume++; return tryNume()
      }

      console.log('[HDMovie2] Unknown server')
      nume++; return tryNume()

    }).catch(function(err) {
      console.log('[HDMovie2] Server ' + nume + ' error: ' + err.message)
      nume++; return tryNume()
    })
  }

  return tryNume()
}

function getStreamFromMoviePage(movieUrl) {
  return httpGet(movieUrl, { 'Referer': BASE + '/' })
    .then(function(html) {
      var postIdMatch = html.match(/postid-(\d+)/)
      if (!postIdMatch) {
        console.log('[HDMovie2] No post ID')
        return null
      }
      var postId = postIdMatch[1]
      console.log('[HDMovie2] Post ID: ' + postId)
      return tryGetStream(postId, movieUrl)
    })
}

function getStreams(tmdbId, mediaType, season, episode) {
  return new Promise(function(resolve) {

    var tmdbUrl = mediaType === 'movie'
      ? 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + TMDB_KEY
      : 'https://api.themoviedb.org/3/tv/' + tmdbId + '?api_key=' + TMDB_KEY

    console.log('[HDMovie2] Start: ' + tmdbId + ' ' + mediaType)

    fetch(tmdbUrl)
      .then(function(r) { return r.json() })
      .then(function(data) {
        var title = data.title || data.name
        if (!title) throw new Error('No title')
        var releaseDate = data.release_date || data.first_air_date || ''
        var year = releaseDate ? parseInt(releaseDate.split('-')[0]) : null
        console.log('[HDMovie2] Title: ' + title + ' Year: ' + year)
        return searchSite(title, year)
      })
      .then(function(results) {
        if (!results || results.length === 0) {
          console.log('[HDMovie2] Not found')
          resolve([])
          return null
        }
        var result = results[0]
        console.log('[HDMovie2] Using: ' + result.url)
        return getStreamFromMoviePage(result.url)
      })
      .then(function(streamData) {
        if (!streamData) { resolve([]); return }
        console.log('[HDMovie2] Resolving stream!')
        resolve([{
          name: '🎬 HDMovie2',
          title: 'Hindi Dubbed • HD',
          url: streamData.url,
          quality: '1080p',
          headers: streamData.headers || {
            'Referer': CDN + '/',
            'Origin': CDN,
            'User-Agent': UA
          }
        }])
      })
      .catch(function(err) {
        console.error('[HDMovie2] Error: ' + err.message)
        resolve([])
      })
  })
}

module.exports = { getStreams }
