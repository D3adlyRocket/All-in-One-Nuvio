const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// ================= FETCH HELPERS =================
async function fetchText(url, headers = {}) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": UA,
      ...headers
    }
  });
  return await res.text();
}

async function fetchJSON(url, headers = {}) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      ...headers
    }
  });
  return await res.json();
}

// ================= QUALITY =================
function getQuality(w, h) {
  if (h >= 2160) return "4K";
  if (h >= 1080) return "1080p";
  if (h >= 720) return "720p";
  if (h >= 480) return "480p";
  return "360p";
}

async function detectQuality(m3u8, headers = {}) {
  try {
    const text = await fetchText(m3u8, headers);

    if (!text.includes("#EXT-X-STREAM-INF")) return "1080p";

    let best = 0;

    for (let line of text.split("\n")) {
      let m = line.match(/RESOLUTION=(\d+)x(\d+)/);
      if (m) {
        let h = parseInt(m[2]);
        if (h > best) best = h;
      }
    }

    return best ? getQuality(0, best) : "1080p";
  } catch {
    return "1080p";
  }
}

// ================= PROVIDERS =================

// GOODSTREAM
async function resolveGoodstream(url) {
  try {
    const html = await fetchText(url, {
      Referer: "https://goodstream.one"
    });

    let m = html.match(/file:\s*"([^"]+)"/);
    if (!m) return null;

    let stream = m[1];

    let headers = {
      Referer: url,
      Origin: "https://goodstream.one"
    };

    let quality = await detectQuality(stream, headers);

    return { url: stream, quality, headers };
  } catch {
    return null;
  }
}

// VOE (simplified but stable)
async function resolveVOE(url) {
  try {
    const html = await fetchText(url, { Referer: url });

    let m = html.match(/['"](https?:\/\/[^"']+\.m3u8[^"']*)['"]/i);
    if (!m) return null;

    let stream = m[1];

    return {
      url: stream,
      quality: await detectQuality(stream, { Referer: url }),
      headers: { Referer: url }
    };
  } catch {
    return null;
  }
}

// FILEMOON
async function resolveFilemoon(url) {
  try {
    let id = url.match(/\/(?:e|d)\/([a-z0-9]{12})/i)?.[1];
    if (!id) return null;

    const data = await fetchJSON(
      `https://filemooon.link/api/videos/${id}/embed/playback`,
      { Referer: url }
    );

    let stream = data?.playback?.sources?.[0]?.url;
    if (!stream) return null;

    return {
      url: stream,
      quality: "1080p",
      headers: {
        Referer: url,
        Origin: "https://filemoon.sx"
      }
    };
  } catch {
    return null;
  }
}

// STREAMWISH / HLSWISH
async function resolveStreamwish(url) {
  try {
    const html = await fetchText(url, {
      Referer: "https://embed69.org/"
    });

    let m = html.match(/file\s*:\s*"([^"]+)"/);
    if (!m) return null;

    let stream = m[1];

    return {
      url: stream,
      quality: "1080p",
      headers: { Referer: url }
    };
  } catch {
    return null;
  }
}

// ================= MAIN RESOLVER =================

function pickResolver(url) {
  if (url.includes("goodstream")) return resolveGoodstream;
  if (url.includes("voe")) return resolveVOE;
  if (url.includes("filemoon")) return resolveFilemoon;
  if (url.includes("streamwish") || url.includes("hlswish")) return resolveStreamwish;
  return null;
}

// ================= MAIN FUNCTION =================

async function getStreams(tmdbId, type, season, episode) {
  if (!tmdbId || !type) return [];

  try {
    // 🔥 GET PLAYER DATA
    const player = await fetchJSON(
      `https://la.movie/wp-api/v1/player?postId=${tmdbId}&demo=0`
    );

    if (!player?.data?.embeds) return [];

    const embeds = player.data.embeds;

    let results = [];

    // 🔥 PARALLEL RESOLVE (ANDROID SAFE)
    await Promise.allSettled(
      embeds.map(async (e) => {
        try {
          let resolver = pickResolver(e.url);
          if (!resolver) return;

          let r = await resolver(e.url);
          if (!r) return;

          results.push({
            name: "LaMovie",
            title: `${r.quality} • ${e.server || "Stream"}`,
            url: r.url,
            headers: r.headers || {}
          });
        } catch {}
      })
    );

    return results;

  } catch {
    return [];
  }
}

module.exports = { getStreams };
