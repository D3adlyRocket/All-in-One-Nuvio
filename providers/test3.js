const TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";
const RGSHOWS_BASE = "api.rgshows.ru";
const RGSHOWS_HEADERS = {
  "referer": "https://rgshows.ru/",
  "origin": "https://rgshows.ru",
  "host": RGSHOWS_BASE,
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
};

function makeRequest(url, options) {
  options = options || {};
  var headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept": "application/json,*/*",
    "Connection": "keep-alive"
  };
  if (options.headers) {
    Object.keys(options.headers).forEach(function(k) { headers[k] = options.headers[k]; });
  }
  return fetch(url, { method: options.method || "GET", headers })
    .then(function(response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response;
    })
    .catch(function(error) {
      console.error("[RGShows] Request failed: " + error.message);
      throw error;
    });
}

function getStreamInfo(url, streamHeaders) {
  return fetch(url, { method: 'HEAD', headers: streamHeaders || {} })
    .then(function(r) {
      var sizeBytes = r.headers.get('content-length');
      var size = sizeBytes ? (parseInt(sizeBytes) / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : 'Unknown';
      var quality = deriveQuality(url);
      var filename = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'stream.mp4';
      return { size: size, quality: quality, filename: filename };
    })
    .catch(function() {
      return { size: 'Unknown', quality: deriveQuality(url), filename: decodeURIComponent(url.split('/').pop().split('?')[0]) || 'stream.mp4' };
    });
}

function deriveQuality(url) {
  if (url.includes('2160') || url.includes('4k')) return '4K';
  if (url.includes('1080')) return '1080p';
  if (url.includes('720')) return '720p';
  if (url.includes('480')) return '480p';
  return 'Auto';
}

function getTmdbInfo(tmdbId, mediaType) {
  var url = "https://api.themoviedb.org/3/" + (mediaType === "tv" ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;
  return makeRequest(url).then(function(r) { return r.json(); }).then(function(data) {
    var title = mediaType === "tv" ? data.name : data.title;
    var year = mediaType === "tv" ? (data.first_air_date || "").substring(0, 4) : (data.release_date || "").substring(0, 4);
    return { title, year };
  });
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  mediaType = mediaType || "movie";
  console.log("[RGShows] Fetching: " + tmdbId + " type=" + mediaType);
  return getTmdbInfo(tmdbId, mediaType).then(function(info) {
    var url = "https://" + RGSHOWS_BASE + "/main";
    if (mediaType === "movie") {
      url += "/movie/" + tmdbId;
    } else {
      url += "/tv/" + tmdbId + "/" + seasonNum + "/" + episodeNum;
    }
    return makeRequest(url, { headers: RGSHOWS_HEADERS }).then(function(r) {
      return r.json();
    }).then(function(data) {
      if (!data || !data.stream || !data.stream.url) {
        console.log("[RGShows] No stream found");
        return [];
      }
      if (data.stream.url === "https://vidzee.wtf/playlist/69/master.m3u8") {
        console.log("[RGShows] Bad stream detected, skipping");
        return [];
      }
      var streamUrl = data.stream.url;
      var streamHost = streamUrl.split("/")[2] || RGSHOWS_BASE;
      var streamHeaders = {
        "referer": "https://www.rgshows.ru/",
        "origin": "https://www.rgshows.ru",
        "host": streamHost,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      };
      var label;
      if (mediaType === "tv" && seasonNum && episodeNum) {
        label = info.title + " S" + String(seasonNum).padStart(2, "0") + "E" + String(episodeNum).padStart(2, "0");
      } else {
        label = info.title + (info.year ? " (" + info.year + ")" : "");
      }
      return getStreamInfo(streamUrl, streamHeaders).then(function(streamInfo) {
        console.log("[RGShows] Found 1 stream");
        return [{
          name: "P-Stream | RGShows - " + streamInfo.quality,
          title: label,
          url: streamUrl,
          quality: streamInfo.quality,
          size: streamInfo.size,
          filename: streamInfo.filename,
          headers: streamHeaders,
          provider: "pstream"
        }];
      });
    });
  }).catch(function(error) {
    console.error("[RGShows] Error: " + error.message);
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.RGShowsScraperModule = { getStreams };
}
