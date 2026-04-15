const TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";
const XPRIME_BACKEND = "https://backend.xprime.tv";

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://xprime.stream/",
  "Origin": "https://xprime.stream"
};

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  mediaType = mediaType || "movie";
  
  // 1. Get Extra IDs (IMDb ID) from TMDB because backends often prefer 'tt12345'
  var tmdbUrl = "https://api.themoviedb.org/3/" + (mediaType === "tv" ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&append_to_response=external_ids";

  return fetch(tmdbUrl, { headers: DEFAULT_HEADERS }).then(function(res) {
    return res.json();
  }).then(function(tmdbData) {
    var title = mediaType === "tv" ? tmdbData.name : tmdbData.title;
    // Use IMDb ID if available, otherwise fallback to TMDB ID
    var externalId = (tmdbData.external_ids && tmdbData.external_ids.imdb_id) || tmdbId;
    
    var backendUrl = mediaType === "movie" 
      ? XPRIME_BACKEND + "/primebox?id=" + externalId + "&type=movie&name=" + encodeURIComponent(title) 
      : XPRIME_BACKEND + "/primebox?id=" + externalId + "&type=tv&name=" + encodeURIComponent(title) + "&season=" + (seasonNum || 1) + "&episode=" + (episodeNum || 1);
    
    return fetch(backendUrl, { headers: DEFAULT_HEADERS });
  }).then(function(res) {
    return res.json();
  }).then(function(backendData) {
    var streams = [];
    var sources = Array.isArray(backendData) ? backendData : (backendData.streams || (backendData.url ? [backendData] : []));
    
    sources.forEach(function(src) {
      if (src.url && src.url.indexOf('http') === 0) {
        streams.push({
          name: "XPrime - " + (src.quality || "HD"),
          url: src.url,
          quality: src.quality || "Auto",
          headers: DEFAULT_HEADERS, // Passes referer to ExoPlayer
          provider: "xprime",
          subtitles: (src.subtitles || []).map(function(s) {
            return { url: s.file || s.url, lang: s.label || "English" };
          })
        });
      }
    });

    return streams; // If this is empty, Nuvio will just show 'No Links Found' instead of a broken link
  }).catch(function() {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
}
