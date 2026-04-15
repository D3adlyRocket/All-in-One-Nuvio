const TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";
const XPRIME_BACKEND = "https://backend.xprime.tv";
const XPRIME_PLAYER = "https://xk4l.mzt4pr8wlkxnv0qsha5g.website";

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, */*",
  "Accept-Language": "en-US,en;q=0.5",
  "Referer": "https://xprime.stream/",
  "Origin": "https://xprime.stream",
  "Connection": "keep-alive"
};

function makeRequest(url, options) {
  options = options || {};
  var headers = Object.assign({}, DEFAULT_HEADERS, options.headers || {});
  return fetch(url, {
    method: options.method || "GET",
    headers
  }).then(function(response) {
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response;
  }).catch(function(err) {
    console.error("[xprime] Request failed: " + url + " - " + err.message);
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
    var year = mediaType === "tv" ? (data.first_air_date || "").substring(0, 4) : (data.release_date || "").substring(0, 4);
    return { title: title || "", year: year || "" };
  });
}

function getStreamsFromBackend(tmdbId, mediaType, name, seasonNum, episodeNum) {
  var url = mediaType === "movie" 
    ? XPRIME_BACKEND + "/primebox?id=" + tmdbId + "&type=movie&name=" + encodeURIComponent(name || "") 
    : XPRIME_BACKEND + "/primebox?id=" + tmdbId + "&type=tv&name=" + encodeURIComponent(name || "") + "&season=" + seasonNum + "&episode=" + episodeNum;
  
  return makeRequest(url).then(function(res) {
    if (!res) return null;
    return res.json();
  }).catch(function() {
    return null;
  });
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  mediaType = mediaType || "movie";
  console.log("[xprime] Fetching: " + tmdbId + " type=" + mediaType);
  
  return getTmdbInfo(tmdbId, mediaType).then(function(tmdbInfo) {
    var title = tmdbInfo && tmdbInfo.title || "";
    return getStreamsFromBackend(tmdbId, mediaType, title, seasonNum || 1, episodeNum || 1);
  }).then(function(backendData) {
    var streams = [];
    if (backendData) {
      var sources = Array.isArray(backendData) ? backendData : backendData.streams ? backendData.streams : backendData.url ? [backendData] : [];
      
      sources.forEach(function(src) {
        if (src.url) {
          streams.push({
            name: "XPrime - " + (src.quality || src.label || "Auto"),
            url: src.url,
            quality: src.quality || "Auto",
            // INJECTING HEADERS HERE FOR EXOPLAYER
            headers: {
                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                "Referer": "https://xprime.stream/",
                "Origin": "https://xprime.stream"
            },
            provider: "xprime",
            subtitles: (src.subtitles || src.tracks || []).map(function(sub) {
              return { url: sub.file || sub.url || sub.src || "", lang: sub.label || sub.language || "Unknown" };
            }).filter(function(s) {
              return s.url;
            })
          });
        }
      });
    }

    // REMOVED THE HTML PLAYER FALLBACK
    // ExoPlayer cannot play the website URL, so we don't want to return it as a stream.
    
    console.log("[xprime] Found " + streams.length + " streams");
    return streams;
  }).catch(function(err) {
    console.error("[xprime] Error: " + err.message);
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.XPrimeScraperModule = { getStreams };
}
