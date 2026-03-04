const NAME = "viu";

async function extractStream(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://vidsrc.to/"
      }
    });

    const html = await res.text();

    // Grab JSON inside VidSrc player JS
    const jsMatch = html.match(/var\s+player_.*?=\s*(\{.*\});/s);
    if (!jsMatch) return null;

    let data;
    try {
      data = JSON.parse(jsMatch[1]);
    } catch (e) {
      return null;
    }

    if (!data || !data.sources) return null;

    // Find first .m3u8 URL
    const m3u8 = data.sources.find(s => s.file && s.file.endsWith(".m3u8"));
    if (!m3u8) return null;

    return m3u8.file;
  } catch (err) {
    console.log("[viu] extract error:", err.message);
    return null;
  }
}

async function getStreams(tmdbId, type, season, episode) {
  console.log("[viu] getStreams:", tmdbId, type, season, episode);

  try {
    let embed;

    if (type === "movie") {
      embed = `https://vidsrc.to/embed/movie/${tmdbId}`;
    } else {
      const s = season || 1;
      const e = episode || 1;
      embed = `https://vidsrc.to/embed/tv/${tmdbId}/${s}/${e}`;
    }

    const stream = await extractStream(embed);

    if (!stream) {
      console.log("[viu] no stream found");
      return [];
    }

    return [
      {
        name: NAME,
        title: "VidSrc",
        url: stream,
        quality: "auto",
        headers: {
          Referer: "https://vidsrc.to/",
          "User-Agent": "Mozilla/5.0"
        }
      }
    ];
  } catch (err) {
    console.log("[viu] error:", err.message);
    return [];
  }
}

module.exports = { getStreams };
