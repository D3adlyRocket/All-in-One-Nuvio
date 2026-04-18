const TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";

// These headers MUST be sent by the Player to avoid the 22004 error
const VIDPLUS_PLAYER_HEADERS = {
  "Origin": "https://player.videasy.net",
  "Referer": "https://player.videasy.net/",
  "User-Agent": "Mozilla/5.0 (Linux; Android 15; ALT-NX1 Build/HONORALT-N31; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36",
  "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Android WebView";v="146"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": '"Android"',
  "X-Requested-With": "ru.rgshows.app"
};

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  mediaType = mediaType || "movie";
  var tmdbUrl = "https://api.themoviedb.org/3/" + (mediaType === "tv" ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;

  return fetch(tmdbUrl)
    .then(function(res) { return res.json(); })
    .then(function(info) {
      var title = mediaType === "tv" ? info.name : info.title;

      // We use the vidsrc.wtf gateway because the old rgshows API is dead
      var gatewayUrl = "https://vidsrc.wtf/embed/" + (mediaType === "tv" 
        ? "tv/" + tmdbId + "/" + seasonNum + "/" + episodeNum 
        : "movie/" + tmdbId);

      return [{
        name: "VidPlus (RGShows)",
        title: title + (mediaType === "tv" ? " S" + seasonNum + "E" + episodeNum : ""),
        url: gatewayUrl,
        quality: "Auto",
        // Nuvio uses this object to tell ExoPlayer which headers to use
        headers: VIDPLUS_PLAYER_HEADERS, 
        provider: "rgshows"
      }];
    })
    .catch(function(err) {
      return [];
    });
}

if (typeof module !== "undefined") module.exports = { getStreams };
