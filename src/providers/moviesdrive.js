// MoviesDrive Provider Plugin (nuvio) – complete, series auto, stream_title used

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// -------------- CONFIG --------------
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const DOMAIN_JSON_URL = "https://himanshu8443.github.io/providers/modflix.json";
const PROVIDER_KEY = "drive";
const HF_API_BASE = "https://badboysxs-md.hf.space";   // <-- your HF space URL
const HF_MOVIE_API = HF_API_BASE + "/movie";
const HF_SERIES_AUTO_API = HF_API_BASE + "/series_auto";
let moviesDriveDomain = "";
let domainCacheTimestamp = 0;
const DOMAIN_CACHE_TTL = 60 * 60 * 1000;

// -------------- UTILS --------------
function makeRequest(url, options = {}) {
  return __async(this, null, function* () {
    const defaultHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json",
    };
    const opts = __spreadProps(__spreadValues({}, options), {
      headers: __spreadValues(__spreadValues({}, defaultHeaders), options.headers || {}),
    });
    const res = yield fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res;
  });
}

// -------------- DOMAIN RESOLVER --------------
function getMoviesDriveDomain() {
  return __async(this, null, function* () {
    const now = Date.now();
    if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL && moviesDriveDomain) {
      return moviesDriveDomain;
    }
    try {
      console.log("[MoviesDrive] Fetching latest domain...");
      const res = yield fetch(DOMAIN_JSON_URL);
      if (res.ok) {
        const data = yield res.json();
        if (data && data[PROVIDER_KEY] && data[PROVIDER_KEY].url) {
          moviesDriveDomain = data[PROVIDER_KEY].url.replace(/\/$/, "");
          domainCacheTimestamp = now;
          console.log(`[MoviesDrive] Domain set to: ${moviesDriveDomain}`);
        }
      }
    } catch (e) {
      console.error("[MoviesDrive] Failed to fetch domain:", e.message);
    }
    return moviesDriveDomain;
  });
}

// -------------- SEARCH (used only for movies) --------------
function searchMoviesDrive(query) {
  return __async(this, null, function* () {
    const domain = yield getMoviesDriveDomain();
    if (!domain) return [];

    const apiUrl = `${domain}/search.php?q=${encodeURIComponent(query)}&page=1`;
    console.log(`[MoviesDrive] API Search: ${apiUrl}`);

    const searchHeaders = {
      "Accept": "*/*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cookie": "_ga=GA1.1.625399613.1778035100; _ga_YLNESKK47K=GS2.1.s1778047448$o2$g1$t1778047466$j42$l0$h0",
      "Referer": `${domain}/search.html?q=${encodeURIComponent(query)}`,
      "Sec-Ch-Ua": "\"Not-A.Brand\";v=\"99\", \"Chromium\";v=\"124\"",
      "Sec-Ch-Ua-Mobile": "?1",
      "Sec-Ch-Ua-Platform": "\"Android\"",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
    };

    try {
      const res = yield makeRequest(apiUrl, { headers: searchHeaders });
      const data = yield res.json();
      if (data && data.hits && data.hits.length > 0) {
        return data.hits.map(hit => ({
          title: hit.document.post_title,
          permalink: hit.document.permalink,
          imdb_id: hit.document.imdb_id || ""
        }));
      }
    } catch (e) {
      console.error("[MoviesDrive] Search API failed:", e);
    }
    return [];
  });
}

// -------------- MAIN getStreams --------------
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return __async(this, null, function* () {
    console.log(`[MoviesDrive] getStreams: TMDB=${tmdbId}, type=${mediaType}, s=${seasonNum}, e=${episodeNum}`);
    try {
      // 1. Get TMDB metadata (title only)
      const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === "tv" ? "tv" : "movie"}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
      const tmdbRes = yield makeRequest(tmdbUrl);
      const tmdbData = yield tmdbRes.json();
      const title = mediaType === "tv" ? tmdbData.name : tmdbData.title;
      if (!title) return [];

      let rawLinks = [];
      if (mediaType === "movie") {
        // ---- MOVIE ----
        const searchResults = yield searchMoviesDrive(title);
        if (!searchResults.length) return [];

        // Simple best match: pick first that contains the year (if we had year) or just the first
        // For reliability, we'll take the first result (same as original simplest approach)
        const selected = searchResults[0];
        const domain = yield getMoviesDriveDomain();
        const pageUrl = domain + selected.permalink;

        const movieApiUrl = `${HF_MOVIE_API}?url=${encodeURIComponent(pageUrl)}`;
        console.log(`[MoviesDrive] HF Movie API: ${movieApiUrl}`);
        const movieRes = yield makeRequest(movieApiUrl);
        const movieData = yield movieRes.json();
        if (movieData && movieData.links) rawLinks = movieData.links;
      } else {
        // ---- TV – use new /series_auto endpoint ----
        const s = seasonNum || 1;
        const ep = episodeNum || 1;
        const seriesApiUrl = `${HF_SERIES_AUTO_API}?q=${encodeURIComponent(title)}&season=${s}&episode=${ep}`;
        console.log(`[MoviesDrive] HF Series Auto: ${seriesApiUrl}`);
        const seriesRes = yield makeRequest(seriesApiUrl);
        const seriesData = yield seriesRes.json();
        if (seriesData && seriesData.links) rawLinks = seriesData.links;
      }

      if (!rawLinks || rawLinks.length === 0) return [];

      // 2. Build streams – use ready-made stream_title from API
      const streams = rawLinks.map(link => ({
        name: `MoviesDrive ${link.name || "Direct"}`,
        title: link.stream_title || `${title} - ${link.quality || "?"}p`,
        url: link.url,
        type: "direct",
        quality: link.quality ? `${link.quality}p` : "Unknown",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "", // we don't have pageUrl for series, but it's fine
        },
      }));

      // Sort by quality descending
      streams.sort((a, b) => {
        const qA = parseInt(a.quality) || 0;
        const qB = parseInt(b.quality) || 0;
        return qB - qA;
      });

      console.log(`[MoviesDrive] Returning ${streams.length} streams`);
      return streams;
    } catch (e) {
      console.error("[MoviesDrive] getStreams error:", e);
      return [];
    }
  });
}

// Export
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
