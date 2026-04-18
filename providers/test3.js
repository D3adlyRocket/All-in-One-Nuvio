const TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";
const RGSHOWS_BASE = "api.rgshows.ru";

// These are the "Magic Headers" you identified for playback
const PLAYBACK_HEADERS = {
  "Origin": "https://player.videasy.net",
  "Referer": "https://player.videasy.net/",
  "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Android WebView";v="146"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": '"Android"',
  "User-Agent": "Mozilla/5.0 (Linux; Android 15; ALT-NX1 Build/HONORALT-N31; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36",
  "Accept": "*/*"
};

async function getTmdbInfo(tmdbId, mediaType) {
  const url = `https://api.themoviedb.org/3/${mediaType === "tv" ? "tv" : "movie"}/${tmdbId}?api_key=${TMDB_API_KEY}`;
  const res = await fetch(url);
  return res.json();
}

async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  mediaType = mediaType || "movie";
  
  try {
    const info = await getTmdbInfo(tmdbId, mediaType);
    const title = mediaType === "tv" ? info.name : info.title;
    const year = (mediaType === "tv" ? info.first_air_date : info.release_date || "").substring(0, 4);

    // Construct the API URL - trying the /main/ logic first
    const apiUrl = `https://${RGSHOWS_BASE}/main/${mediaType === "movie" ? "movie/" + tmdbId : "tv/" + tmdbId + "/" + seasonNum + "/" + episodeNum}`;

    // We use standard headers for the API fetch, but PLAYBACK headers for the result
    const response = await fetch(apiUrl, {
      headers: {
        "Referer": "https://rgshows.ru/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    const data = await response.json();

    if (!data || !data.stream || !data.stream.url) {
      return [];
    }

    // Check if it's the known bad master.m3u8
    if (data.stream.url.includes("vidzee.wtf/playlist/69")) {
      return [];
    }

    const label = mediaType === "tv" 
      ? `${title} S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")}`
      : `${title} (${year})`;

    return [{
      name: "RGShows (Direct)",
      title: label,
      url: data.stream.url, // This must be the .m3u8 URL
      quality: "Auto",
      headers: PLAYBACK_HEADERS,
      provider: "rgshows"
    }];

  } catch (err) {
    console.error("[RGShows] Error:", err.message);
    return [];
  }
}

if (typeof module !== "undefined") module.exports = { getStreams };
