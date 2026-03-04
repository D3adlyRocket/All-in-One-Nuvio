console.log('[DOMTY] Provider Loaded');

const TMDB = "https://api.themoviedb.org/3";
const KEY = "1";

const BASE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Accept: "*/*",
};

const SITES = [
  "https://mycima.horse",
  "https://fajer.show",
  "https://ak.sv",
  "https://cimawbas.org",
];

function request(url, headers = {}) {
  return fetch(url, {
    headers: { ...BASE_HEADERS, ...headers },
  }).then((r) => r.text());
}

function getTitle(id, type) {
  return fetch(`${TMDB}/${type}/${id}?api_key=${KEY}`)
    .then((r) => r.json())
    .then((d) => d.title || d.name || id)
    .catch(() => id);
}

function findPlayer(html) {
  const match = html.match(/<iframe[^>]+src="([^"]+)"/i);
  return match ? match[1] : null;
}

function findStream(html) {
  const m3u8 = html.match(/https?:\/\/[^"' ]+\.m3u8[^"' ]*/i);
  if (m3u8) return m3u8[0];

  const mp4 = html.match(/https?:\/\/[^"' ]+\.mp4[^"' ]*/i);
  if (mp4) return mp4[0];

  return null;
}

function search(site, query) {
  const url = `${site}/?s=${encodeURIComponent(query)}`;

  return request(url).then((html) => {
    const m = html.match(/<a href="([^"]+)"[^>]*>(.*?)<\/a>/i);
    return m ? m[1] : null;
  });
}

function scrapePage(url) {
  return request(url).then((html) => {
    const iframe = findPlayer(html);
    if (!iframe) return null;

    return request(iframe, { Referer: url }).then((playerHtml) => {
      return findStream(playerHtml);
    });
  });
}

function trySites(title) {
  let index = 0;

  function next() {
    if (index >= SITES.length) return Promise.resolve(null);

    const site = SITES[index++];

    return search(site, title)
      .then((url) => {
        if (!url) return next();
        return scrapePage(url);
      })
      .then((stream) => {
        if (stream) return stream;
        return next();
      })
      .catch(next);
  }

  return next();
}

function getStreams(tmdbId, type = "movie") {
  console.log("[DOMTY] Fetching", tmdbId);

  return getTitle(tmdbId, type)
    .then((title) => {
      console.log("[DOMTY] Title:", title);
      return trySites(title);
    })
    .then((stream) => {
      if (!stream) {
        console.log("[DOMTY] No streams found");
        return { sources: [], subtitles: [] };
      }

      return {
        sources: [
          {
            url: stream,
            quality: "HD",
            type: stream.includes("m3u8") ? "hls" : "mp4",
          },
        ],
        subtitles: [],
      };
    });
}

module.exports = { getStreams };
