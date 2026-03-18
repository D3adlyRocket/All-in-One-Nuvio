/**
 * movies4u - Built from src/movies4u/
 * Generated: 2026-03-06T14:24:07.911Z
 */
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

// src/providers/movies4u/index.js
var cheerio = require("cheerio-without-node-native");
var TMDB_API_KEY = "1b3113663c9004682ed61086cf967c44";
var TMDB_BASE_URL = "https://api.themoviedb.org/3";
var MAIN_URL = "https://movies4u.tl";
var M4UPLAY_BASE = "https://m4uplay.store";
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Referer": `${MAIN_URL}/`
};
function fetchWithTimeout(_0) {
  return __async(this, arguments, function* (url, options = {}, timeout = 1e4) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = yield fetch(url, __spreadProps(__spreadValues({}, options), {
        signal: controller.signal
      }));
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  });
}
function normalizeTitle(title) {
  if (!title)
    return "";
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}
function calculateTitleSimilarity(title1, title2) {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);
  if (norm1 === norm2)
    return 1;
  if (norm1.includes(norm2) || norm2.includes(norm1))
    return 0.9;
  const words1 = new Set(norm1.split(/\s+/).filter((w) => w.length > 2));
  const words2 = new Set(norm2.split(/\s+/).filter((w) => w.length > 2));
  if (words1.size === 0 || words2.size === 0)
    return 0;
  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = /* @__PURE__ */ new Set([...words1, ...words2]);
  return intersection.size / union.size;
}
function findBestTitleMatch(mediaInfo, searchResults) {
  if (!searchResults || searchResults.length === 0)
    return null;
  const targetTitle = mediaInfo.title.toLowerCase().replace(/[^a-z0-9]/g, "");
  const targetYear = mediaInfo.year ? parseInt(mediaInfo.year) : null;
  let bestMatch = null;
  let bestScore = 0;
  for (const result of searchResults) {
    const normalizedResultTitle = result.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    let score = calculateTitleSimilarity(mediaInfo.title, result.title);
    const titleMatch = normalizedResultTitle.includes(targetTitle) || targetTitle.includes(normalizedResultTitle);
    const yearMatch = !targetYear || result.title.includes(targetYear.toString()) || result.title.includes((targetYear + 1).toString()) || result.title.includes((targetYear - 1).toString());
    if (titleMatch && yearMatch) {
      score += 0.5;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = result;
    }
  }
  if (bestMatch && bestScore > 0.4) {
    console.log(`[Movies4u] Best title match: "${bestMatch.title}" (score: ${bestScore.toFixed(2)})`);
    return bestMatch;
  }
  return null;
}
function formatStreamTitle(mediaInfo, stream) {
  const quality = stream.quality || "Unknown";
  const title = mediaInfo.title || "Unknown";
  const isMaster = stream.isMaster || false;
  let year = mediaInfo.year || "";
  if (!year || year === "N/A") {
    const yearMatch = (title + " " + (stream.text || "")).match(/\b(19|20)\d{2}\b/);
    if (yearMatch)
      year = yearMatch[0];
  }
  const audioInfo = stream.audioInfo || "";
  let size = "UNKNOWN";
  const sizeMatch = stream.text ? stream.text.match(/(\d+(?:\.\d+)?\s*(?:GB|MB))/i) : null;
  if (sizeMatch)
    size = sizeMatch[1].toUpperCase();
  let type = "UNKNOWN";
  const searchString = ((stream.text || "") + " " + (stream.url || "") + " " + (stream.label || "")).toLowerCase();
  if (searchString.includes("bluray") || searchString.includes("brrip"))
    type = "BluRay";
  else if (searchString.includes("web-dl"))
    type = "WEB-DL";
  else if (searchString.includes("webrip"))
    type = "WEBRip";
  else if (searchString.includes("hdrip"))
    type = "HDRip";
  else if (searchString.includes("dvdrip"))
    type = "DVDRip";
  else if (searchString.includes("bdrip"))
    type = "BDRip";
  else if (searchString.includes("hdtv"))
    type = "HDTV";
  const yearStr = year ? ` (${year})` : "";
  let lang = "UNKNOWN";
  if (audioInfo) {
    const multiMatch = audioInfo.match(/\[Multi Audio: (.*?)\]/i);
    if (multiMatch) {
      lang = multiMatch[1].toUpperCase();
    } else {
      const singleMatch = audioInfo.match(/\[Audio: (.*?)\]/i);
      if (singleMatch) {
        lang = singleMatch[1].toUpperCase();
      } else {
        lang = audioInfo.toUpperCase();
      }
    }
  }
  const displayQuality = quality;
  const typeLine = type && type !== "UNKNOWN" ? `\u{1F4FA}: ${type}
` : "";
  const sizeLine = size && size !== "UNKNOWN" ? `\u{1F4BE}: ${size} | \u{1F69C}: movies4u
` : "";
  return `Movies4u (Instant) (${displayQuality})
${typeLine}\u{1F4FC}: ${title}${yearStr} - ${displayQuality}
${sizeLine}\u{1F310}: ${lang}`;
}
function unpack(p, a, c, k) {
  while (c--) {
    if (k[c]) {
      const placeholder = c.toString(a);
      p = p.replace(new RegExp("\\b" + placeholder + "\\b", "g"), k[c]);
    }
  }
  return p;
}
function resolveHlsPlaylist(masterUrl) {
  return __async(this, null, function* () {
    const result = {
      masterUrl,
      variants: [],
      // {url, quality}
      audios: [],
      isMaster: false
    };
    try {
      console.log(`[Movies4u] Resolving HLS playlist: ${masterUrl}`);
      const response = yield fetchWithTimeout(masterUrl, {
        headers: __spreadProps(__spreadValues({}, HEADERS), {
          "Referer": M4UPLAY_BASE
        })
      }, 5e3);
      if (!response.ok)
        return result;
      const content = yield response.text();
      if (!content.includes("#EXTM3U"))
        return result;
      if (content.includes("#EXT-X-STREAM-INF")) {
        result.isMaster = true;
      } else if (content.includes("#EXT-X-MEDIA:TYPE=AUDIO") && !content.includes("#EXT-X-STREAM-INF")) {
        console.log(`[Movies4u] Found audio-only playlist, skipping resolution`);
        return result;
      }
      const audioMatches = content.matchAll(/#EXT-X-MEDIA:TYPE=AUDIO,.*?NAME="([^"]+)"(?:.*?LANGUAGE="([^"]+)")?(?:.*?CHANNELS="([^"]+)")?(?:.*?URI="([^"]+)")?/g);
      for (const match of audioMatches) {
        let audioName = match[1];
        const language = match[2];
        const channels = match[3];
        let audioUri = match[4];
        if (audioUri && !audioUri.startsWith("http")) {
          const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf("/") + 1);
          audioUri = baseUrl + audioUri;
        }
        if (channels) {
          const channelMap = { "1": "1.0", "2": "2.0", "6": "5.1", "8": "7.1" };
          const channelStr = channelMap[channels] || channels;
          audioName += ` (${channelStr})`;
        }
        if (!result.audios.some((a) => a.name === audioName)) {
          result.audios.push({
            name: audioName,
            language: language || "unknown",
            uri: audioUri
          });
        }
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes("#EXT-X-STREAM-INF")) {
          let quality = "Unknown";
          const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
          if (resMatch) {
            const height = parseInt(resMatch[2]);
            if (height >= 2160)
              quality = "4K";
            else if (height >= 1080)
              quality = "1080p";
            else if (height >= 720)
              quality = "720p";
            else if (height >= 480)
              quality = "480p";
            else
              quality = `${height}p`;
          }
          if (quality === "Unknown") {
            const nameMatch = line.match(/NAME="([^"]+)"/i);
            if (nameMatch)
              quality = nameMatch[1];
          }
          let j = i + 1;
          while (j < lines.length && (lines[j].trim().startsWith("#") || !lines[j].trim())) {
            j++;
          }
          if (j < lines.length) {
            let variantPath = lines[j].trim();
            if (variantPath) {
              let variantUrl = variantPath;
              if (!variantUrl.startsWith("http")) {
                const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf("/") + 1);
                variantUrl = baseUrl + variantUrl;
              }
              if (!result.variants.some((v) => v.url === variantUrl)) {
                result.variants.push({ url: variantUrl, quality });
              }
            }
          }
          i = j;
        }
      }
      console.log(`[Movies4u] HLS Summary: ${result.variants.length} qualities, ${result.audios.length} audios found`);
      return result;
    } catch (error) {
      console.error(`[Movies4u] HLS resolution error: ${error.message}`);
      return result;
    }
  });
}
function extractFromM4UPlay(embedUrl) {
  return __async(this, null, function* () {
    try {
      console.log(`[Movies4u] Extracting from m4uplay: ${embedUrl}`);
      const response = yield fetchWithTimeout(embedUrl, {
        headers: __spreadProps(__spreadValues({}, HEADERS), { "Referer": MAIN_URL })
      }, 8e3);
      const html = yield response.text();
      const packerMatch = html.match(new RegExp("eval\\(function\\(p,a,c,k,e,d\\)\\{.*?\\}\\s*\\((.*)\\)\\s*\\)", "s"));
      let unpackedHtml = html;
      if (packerMatch) {
        try {
          const rawArgs = packerMatch[1].trim();
          const argsMatch = rawArgs.match(new RegExp(`^['"](.*)['"]\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*['"](.*?)['"]\\.split\\(['"]\\|['"]\\)`, "s"));
          if (argsMatch) {
            unpackedHtml += "\n" + unpack(argsMatch[1], parseInt(argsMatch[2]), parseInt(argsMatch[3]), argsMatch[4].split("|"));
          }
        } catch (unpackError) {
        }
      }
      let finalStreamUrl = null;
      const hlsPatterns = [
        /https?:\/\/[^\s"']+\.(?:m3u8|txt)(?:\?[^\s"']*)?/,
        /["']?(\/(?:stream|3o)\/[^"'\s]+\.(?:m3u8|txt))[^\s"']*/,
        /["']file["']\s*:\s*["']([^"']+\.(?:m3u8|txt)[^"']*)["']/,
        /https?:\/\/[^\s"']*master\.txt[^\s"']*/,
        new RegExp(`["'](?:playlist|sources)["']\\s*:\\s*\\[\\s*\\{[^}]*["']file["']\\s*:\\s*["']([^"']+)["']`, "s"),
        /([\/a-zA-Z0-9_\-\.]+\/master\.(?:m3u8|txt))/
      ];
      for (const pattern of hlsPatterns) {
        const match = unpackedHtml.match(pattern);
        if (match) {
          let url = match[1] || match[0];
          if (url.startsWith("/"))
            url = M4UPLAY_BASE + url;
          finalStreamUrl = url;
          break;
        }
      }
      if (finalStreamUrl) {
        if (finalStreamUrl.includes("master.")) {
          console.log(`[Movies4u] Resolving master playlist...`);
          const resolutionResult = yield resolveHlsPlaylist(finalStreamUrl);
          if (resolutionResult.isMaster) {
            const audioNames = resolutionResult.audios.map((a) => a.name);
            const audioInfo = audioNames.length > 1 ? ` [Multi Audio: ${audioNames.join(", ")}]` : "";
            if (audioNames.length > 1) {
              console.log(`[Movies4u] Found multi-audio: ${audioNames.join(", ")}`);
            }
            const qualities = resolutionResult.variants.map((v) => v.quality);
            const bestQuality = qualities.includes("4K") ? "4K" : qualities.includes("1080p") ? "1080p" : qualities.includes("720p") ? "720p" : qualities.includes("480p") ? "480p" : qualities[0] || "Unknown";
            return [{
              url: resolutionResult.masterUrl,
              audios: resolutionResult.audios,
              audioInfo,
              quality: bestQuality,
              isMaster: true
            }];
          }
        }
        return [{
          url: finalStreamUrl,
          audios: [],
          audioInfo: "",
          quality: "Unknown"
        }];
      }
      console.log(`[Movies4u] Could not extract stream URL from m4uplay embed`);
      return [];
    } catch (error) {
      console.error(`[Movies4u] M4UPlay extraction error: ${error.message}`);
      return [];
    }
  });
}
function extractWatchLinks(movieUrl) {
  return __async(this, null, function* () {
    try {
      console.log(`[Movies4u] Extracting watch links from: ${movieUrl}`);
      const response = yield fetchWithTimeout(movieUrl, { headers: HEADERS }, 8e3);
      const html = yield response.text();
      const $ = cheerio.load(html);
      const watchLinks = [];
      $("a.btn.btn-zip").each((i, el) => {
        const href = $(el).attr("href");
        const text = $(el).text().trim();
        if (href && (href.includes("m4uplay.com") || href.includes("m4uplay.store") || href.includes("m4uplay."))) {
          watchLinks.push({
            url: href,
            quality: text.includes("1080p") ? "1080p" : text.includes("720p") ? "720p" : text.includes("480p") ? "480p" : text.includes("4K") || text.includes("2160p") ? "4K" : "Unknown",
            label: text
          });
        }
      });
      console.log(`[Movies4u] Found ${watchLinks.length} watch links`);
      return watchLinks;
    } catch (error) {
      console.error(`[Movies4u] Error extracting watch links: ${error.message}`);
      return [];
    }
  });
}
function getTMDBDetails(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const type = mediaType === "movie" ? "movie" : "tv";
    const url = `${TMDB_BASE_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const response = yield fetchWithTimeout(url, {}, 8e3);
    if (!response.ok)
      throw new Error(`TMDB error: ${response.status}`);
    const data = yield response.json();
    return {
      title: data.title || data.name,
      year: (data.release_date || data.first_air_date || "").split("-")[0]
    };
  });
}
function searchMovies(query) {
  return __async(this, null, function* () {
    try {
      const searchUrl = `${MAIN_URL}/?s=${encodeURIComponent(query)}`;
      console.log(`[Movies4u] Searching: ${searchUrl}`);
      const response = yield fetchWithTimeout(searchUrl, { headers: HEADERS }, 8e3);
      const html = yield response.text();
      const $ = cheerio.load(html);
      const results = [];
      $("h3.entry-title a").each((i, el) => {
        const title = $(el).text().trim();
        const url = $(el).attr("href");
        if (title && url)
          results.push({ title, url });
      });
      console.log(`[Movies4u] Found ${results.length} search results`);
      return results;
    } catch (error) {
      console.error(`[Movies4u] Search error: ${error.message}`);
      return [];
    }
  });
}
function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  return __async(this, null, function* () {
    console.log(`[Movies4u] Processing ${mediaType} ${tmdbId}`);
    try {
      let mediaInfo;
      const isNumericId = /^\d+$/.test(tmdbId);
      if (isNumericId) {
        try {
          mediaInfo = yield getTMDBDetails(tmdbId, mediaType);
        } catch (error) {
          mediaInfo = { title: tmdbId, year: null };
        }
      } else {
        mediaInfo = { title: tmdbId, year: null };
      }
      const searchResults = yield searchMovies(mediaInfo.title);
      if (searchResults.length === 0)
        return [];
      const bestMatch = findBestTitleMatch(mediaInfo, searchResults);
      if (!bestMatch)
        return [];
      console.log(`[Movies4u] Found match: ${bestMatch.title}`);
      const yearMatch = bestMatch.title.match(/\((20\d{2}|19\d{2})\)/);
      if (mediaInfo.title.toLowerCase() === tmdbId.toLowerCase()) {
        mediaInfo.title = bestMatch.title.split("(")[0].trim();
        if (yearMatch)
          mediaInfo.year = yearMatch[1];
      }
      const watchLinks = yield extractWatchLinks(bestMatch.url);
      if (watchLinks.length === 0)
        return [];
      const streams = [];
      for (const watchLink of watchLinks) {
        const extractionResults = yield extractFromM4UPlay(watchLink.url);
        for (const result of extractionResults) {
          const streamObj = __spreadProps(__spreadValues({}, result), {
            quality: result.quality !== "Unknown" ? result.quality : watchLink.quality,
            text: watchLink.label,
            isMaster: result.isMaster
          });
          streams.push({
            name: "Movies4u",
            title: formatStreamTitle(mediaInfo, streamObj),
            url: result.url,
            quality: streamObj.quality,
            headers: {
              "Referer": "https://m4uplay.store/",
              "User-Agent": HEADERS["User-Agent"],
              "Origin": "https://m4uplay.store"
            },
            provider: "Movies4u"
          });
        }
      }
      console.log(`[Movies4u] Extracted ${streams.length} streams`);
      return streams;
    } catch (error) {
      console.error("[Movies4u] getStreams failed:", error.message);
      return [];
    }
  });
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = { getStreams };
}
