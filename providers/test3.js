const TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";

// The exact headers that worked for your playback
const PLAYBACK_HEADERS = {
  "Origin": "https://player.videasy.net",
  "Referer": "https://player.videasy.net/",
  "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Android WebView";v="146"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": '"Android"',
  "User-Agent": "Mozilla/5.0 (Linux; Android 15; ALT-NX1 Build/HONORALT-N31; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36",
  "Accept": "*/*",
  "Accept-Encoding": "identity;q=1, *;q=0"
};

async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  mediaType = mediaType || "movie";
  
  try {
    // 1. Get Title/Year from TMDB
    const tmdbRes = await fetch(`https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`);
    const info = await tmdbRes.json();
    const title = mediaType === "tv" ? info.name : info.title;

    // 2. Target the new 2026 VidSrc/Videasy API
    // We try to fetch from the specific API that powers the vidsrc.wtf site
    const apiUrl = `https://vidsrc.wtf/api/source/${mediaType}/${tmdbId}${mediaType === 'tv' ? `/${seasonNum}/${episodeNum}` : ''}`;

    const response = await fetch(apiUrl, {
      headers: {
        "Referer": "https://vidsrc.wtf/",
        "User-Agent": PLAYBACK_HEADERS["User-Agent"]
      }
    });

    const data = await response.json();

    // If the API gives us a list of sources, we find the "VidPlus" or "VidEasy" one
    let finalUrl = "";
    if (data.url) {
      finalUrl = data.url;
    } else if (data.data && data.data.sources) {
      // Find the source that points to vidplus or videasy
      const source = data.data.sources.find(s => s.name.toLowerCase().includes('vid'));
      if (source) finalUrl = source.url;
    }

    if (!finalUrl) {
      // LAST RESORT: Try to build a direct embed link if the API call is restricted
      finalUrl = `https://vidsrc.wtf/embed/${mediaType}/${tmdbId}${mediaType === 'tv' ? `/${seasonNum}/${episodeNum}` : ''}`;
    }

    return [{
      name: "RGShows (VidPlus)",
      title: title + (mediaType === "tv" ? ` S${seasonNum}E${episodeNum}` : ""),
      url: finalUrl,
      quality: "1080p",
      headers: PLAYBACK_HEADERS, // Passing the headers you provided
      provider: "rgshows"
    }];

  } catch (err) {
    console.error("[Scraper] Fetch Error:", err.message);
    return [];
  }
}

if (typeof module !== "undefined") module.exports = { getStreams };
