const TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";
const XPRIME_BACKEND = "https://backend.xprime.tv";

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, */*",
  "Referer": "https://xprime.stream/",
  "Origin": "https://xprime.stream",
  "Connection": "keep-alive"
};

function makeRequest(url, options) {
  options = options || {};
  var headers = Object.assign({}, DEFAULT_HEADERS, options.headers || {});
  return fetch(url, {
    method: options.method || "GET",
    headers: headers
  }).then(function(response) {
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response;
  }).catch(function(err) {
    return null;
  });
}

function getTmdbInfo(tmdbId, mediaType) {
  var url = "https://api.themoviedb.org/3/" + (mediaType === "tv" ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;
  return makeRequest(url).then(function(res) {
    if (!res) return null;
    return res.json();
  }).then(function(data) {
    if (!data) return { title: "", year: "" };
    var title = mediaType === "tv" ? data.name : data.title;
    return { title: title || "" };
  });
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  mediaType = mediaType || "movie";
  
  return getTmdbInfo(tmdbId, mediaType).then(function(tmdbInfo) {
    var title = tmdbInfo && tmdbInfo.title || "";
    var url = mediaType === "movie" 
      ? XPRIME_BACKEND + "/primebox?id=" + tmdbId + "&type=movie&name=" + encodeURIComponent(title) 
      : XPRIME_BACKEND + "/primebox?id=" + tmdbId + "&type=tv&name=" + encodeURIComponent(title) + "&season=" + (seasonNum || 1) + "&episode=" + (episodeNum || 1);
    
    return makeRequest(url);
  }).then(function(res) {
    if (!res) return [];
    return res.json();
  }).then(function(backendData) {
    var streams = [];
    if (backendData) {
      var sources = Array.isArray(backendData) ? backendData : (backendData.streams || (backendData.url ? [backendData] : []));
      
      sources.forEach(function(src) {
        if (src.url) {
          streams.push({
            name: "XPrime - " + (src.quality || "Auto"),
            url: src.url,
            // CRITICAL: ExoPlayer needs these specific headers to bypass the 403 error
            headers: {
              "User-Agent": DEFAULT_HEADERS["User-Agent"],
              "Referer": "https://xprime.stream/",
              "Origin": "https://xprime.stream"
            },
            quality: src.quality || "Auto",
            subtitles: (src.subtitles || []).map(function(sub) {
              return { url: sub.file || sub.url, lang: sub.label || "English" };
            })
          });
        }
      });
    }
    return streams;
  }).catch(function(err) {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
}
