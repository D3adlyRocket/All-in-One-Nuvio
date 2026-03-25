// REAL VidKing Resolver (API-based)

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    let apiUrl;

    if (mediaType === "movie") {
      apiUrl = `https://www.vidking.net/api/source/${tmdbId}`;
    } else {
      apiUrl = `https://www.vidking.net/api/source/${tmdbId}?s=${season}&e=${episode}`;
    }

    console.log("[VidKing] API:", apiUrl);

    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://www.vidking.net/",
        "Origin": "https://www.vidking.net"
      }
    });

    const data = await res.json();
    console.log("[VidKing] Data:", data);

    if (!data || !data.sources) return [];

    const streams = [];

    for (const source of data.sources) {
      if (!source.file) continue;

      streams.push({
        name: "VidKing",
        title: source.label || "Auto",
        url: source.file,
        quality: source.label || "HD",
        headers: {
          "Referer": "https://www.vidking.net/",
          "User-Agent": "Mozilla/5.0"
        }
      });
    }

    return streams;

  } catch (e) {
    console.log("[VidKing] Error:", e);
    return [];
  }
}

module.exports = { getStreams };
