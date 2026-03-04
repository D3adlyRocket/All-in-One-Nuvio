// ───────── Nuvio Provider: DomTy ─────────
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

// ───────── Helper Functions ─────────
async function httpGet(url, referer) {
  try {
    const res = await fetch(url, { headers: { ...DEFAULT_HEADERS, Referer: referer || url } });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

function extractStreams(html) {
  const urls = new Set();
  const patterns = [
    /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi,
    /https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/gi,
    /file\s*:\s*["']([^"']+)["']/gi,
    /source\s*src=["']([^"']+)["']/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html))) urls.add(m[1]);
  }
  return [...urls];
}

function extractIframes(html) {
  const frames = [];
  const re = /<iframe[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    let src = m[1];
    if (src.startsWith("//")) src = "https:" + src;
    if (src.startsWith("http")) frames.push(src);
  }
  return frames;
}

function getQuality(url) {
  if (/2160|4k/i.test(url)) return "4K";
  if (/1080/.test(url)) return "1080p";
  if (/720/.test(url)) return "720p";
  if (/480/.test(url)) return "480p";
  return "HD";
}

function makeStream(name, url, referer) {
  return {
    name,
    url,
    quality: getQuality(url),
    headers: {
      Referer: referer,
      "User-Agent": DEFAULT_HEADERS["User-Agent"],
    },
  };
}

// ───────── Extract Streams from Page ─────────
async function fetchStreamsFromPage(name, pageUrl) {
  const html = await httpGet(pageUrl);
  if (!html) return [];

  const streams = extractStreams(html).map((u) => makeStream(name, u, pageUrl));
  if (streams.length) return streams;

  const iframes = extractIframes(html).slice(0, 3);
  const results = await Promise.all(
    iframes.map(async (frame) => {
      const ih = await httpGet(frame, pageUrl);
      return extractStreams(ih).map((u) => makeStream(name, u, frame));
    })
  );
  return results.flat();
}

// ───────── Search ─────────
async function searchSite(name, base, query) {
  const urls = [
    `${base}/?s=${encodeURIComponent(query)}`,
    `${base}/search/${encodeURIComponent(query)}`,
  ];

  for (const url of urls) {
    const html = await httpGet(url, base);
    if (!html) continue;

    const results = [];
    const re = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>(.*?)<\/
