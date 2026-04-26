var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __objRest = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
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

// src/formatter.js
var require_formatter = __commonJS({
  "src/formatter.js"(exports2, module2) {
    function normalizePlaybackHeaders(headers) {
      if (!headers || typeof headers !== "object") return headers;
      const normalized = {};
      for (const [key, value] of Object.entries(headers)) {
        if (value == null) continue;
        const lowerKey = String(key).toLowerCase();
        if (lowerKey === "user-agent") normalized["User-Agent"] = value;
        else if (lowerKey === "referer" || lowerKey === "referrer") normalized["Referer"] = value;
        else if (lowerKey === "origin") normalized["Origin"] = value;
        else if (lowerKey === "accept") normalized["Accept"] = value;
        else if (lowerKey === "accept-language") normalized["Accept-Language"] = value;
        else normalized[key] = value;
      }
      return normalized;
    }
    function shouldForceNotWebReadyForPlugin(stream, providerName, headers, behaviorHints) {
      const text = [
        stream == null ? void 0 : stream.url,
        stream == null ? void 0 : stream.name,
        stream == null ? void 0 : stream.title,
        stream == null ? void 0 : stream.server,
        providerName
      ].filter(Boolean).join(" ").toLowerCase();
      if (text.includes("mixdrop") || text.includes("m1xdrop") || text.includes("mxcontent")) {
        return true;
      }
      if (text.includes("loadm") || text.includes("loadm.cam")) {
        return true;
      }
      return false;
    }
    function formatStream2(stream, providerName) {
      let quality = stream.quality || "";
      if (quality === "4K") quality = "\u{1F525}4K UHD";
      else if (quality === "1440p") quality = "\u2728 QHD";
      else if (quality === "1080p") quality = "\u{1F680} FHD";
      else if (quality === "720p") quality = "\u{1F4BF} HD";
      else if (quality === "576p" || quality === "480p" || quality === "360p" || quality === "240p") quality = "\u{1F4A9} Low Quality";
      else if (!quality || ["auto", "unknown", "unknow"].includes(String(quality).toLowerCase())) quality = "Auto";
      let title = `\u{1F4C1} ${stream.title || "Stream"}`;
      let language = stream.language;
      if (!language) {
        if (stream.name && (stream.name.includes("SUB ITA") || stream.name.includes("SUB"))) language = "\u{1F1EF}\u{1F1F5} \u{1F1EE}\u{1F1F9}";
        else if (stream.title && (stream.title.includes("SUB ITA") || stream.title.includes("SUB"))) language = "\u{1F1EF}\u{1F1F5} \u{1F1EE}\u{1F1F9}";
        else language = "Language: \u{1F1EC}\u{1F1E7} \u{1F1EE}\u{1F1F9}";
      }
      let details = [];
      if (stream.size) details.push(`\u{1F4E6} ${stream.size}`);
      const desc = details.join(" | ");
      let pName = stream.name || stream.server || providerName;
      if (pName) {
        pName = pName.replace(/\s*\[?\(?\s*SUB\s*ITA\s*\)?\]?/i, "").replace(/\s*\[?\(?\s*ITA\s*\)?\]?/i, "").replace(/\s*\[?\(?\s*SUB\s*\)?\]?/i, "").replace(/\(\s*\)/g, "").replace(/\[\s*\]/g, "").trim();
      }
      if (pName === providerName) {
        pName = pName.charAt(0).toUpperCase() + pName.slice(1);
      }
      if (pName) {
        pName = `\u{1F4E1} ${pName}`;
      }
      const behaviorHints = stream.behaviorHints && typeof stream.behaviorHints === "object" ? __spreadValues({}, stream.behaviorHints) : {};
      let finalHeaders = stream.headers;
      if (behaviorHints.proxyHeaders && behaviorHints.proxyHeaders.request) {
        finalHeaders = behaviorHints.proxyHeaders.request;
      } else if (behaviorHints.headers) {
        finalHeaders = behaviorHints.headers;
      }
      finalHeaders = normalizePlaybackHeaders(finalHeaders);
      const isStreamingCommunityProvider = String(providerName || "").toLowerCase() === "streamingcommunity" || String((stream == null ? void 0 : stream.name) || "").toLowerCase().includes("streamingcommunity");
      if (isStreamingCommunityProvider && !finalHeaders) {
        delete behaviorHints.proxyHeaders;
        delete behaviorHints.headers;
        delete behaviorHints.notWebReady;
      }
      if (finalHeaders) {
        behaviorHints.proxyHeaders = behaviorHints.proxyHeaders || {};
        behaviorHints.proxyHeaders.request = finalHeaders;
        behaviorHints.headers = finalHeaders;
      }
      const shouldForceNotWebReady = shouldForceNotWebReadyForPlugin(stream, providerName, finalHeaders, behaviorHints);
      if (!isStreamingCommunityProvider && shouldForceNotWebReady) {
        behaviorHints.notWebReady = true;
      } else {
        delete behaviorHints.notWebReady;
      }
      const finalName = pName;
      let finalTitle = `\u{1F4C1} ${stream.title || "Stream"}`;
      if (desc) finalTitle += ` | ${desc}`;
      if (language) finalTitle += ` | ${language}`;
      return __spreadProps(__spreadValues({}, stream), {
        name: finalName,
        title: finalTitle,
        providerName: pName,
        qualityTag: quality,
        description: desc,
        originalTitle: stream.title || "Stream",
        language,
        _nuvio_formatted: true,
        behaviorHints,
        headers: finalHeaders
      });
    }
    module2.exports = { formatStream: formatStream2 };
  }
});

// src/fetch_helper.js
var require_fetch_helper = __commonJS({
  "src/fetch_helper.js"(exports2, module2) {
    var FETCH_TIMEOUT = 3e4;
    function createTimeoutSignal(timeoutMs) {
      const parsed = Number.parseInt(String(timeoutMs), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return { signal: void 0, cleanup: null, timed: false };
      }
      if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
        return { signal: AbortSignal.timeout(parsed), cleanup: null, timed: true };
      }
      if (typeof AbortController !== "undefined" && typeof setTimeout === "function") {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, parsed);
        return {
          signal: controller.signal,
          cleanup: () => clearTimeout(timeoutId),
          timed: true
        };
      }
      return { signal: void 0, cleanup: null, timed: false };
    }
    function fetchWithTimeout(_0) {
      return __async(this, arguments, function* (url, options = {}) {
        if (typeof fetch === "undefined") {
          throw new Error("No fetch implementation found!");
        }
        const _a = options, { timeout } = _a, fetchOptions = __objRest(_a, ["timeout"]);
        const requestTimeout = timeout || FETCH_TIMEOUT;
        const timeoutConfig = createTimeoutSignal(requestTimeout);
        const requestOptions = __spreadValues({}, fetchOptions);
        if (timeoutConfig.signal) {
          if (requestOptions.signal && typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
            requestOptions.signal = AbortSignal.any([requestOptions.signal, timeoutConfig.signal]);
          } else if (!requestOptions.signal) {
            requestOptions.signal = timeoutConfig.signal;
          }
        }
        try {
          const response = yield fetch(url, requestOptions);
          return response;
        } catch (error) {
          if (error && error.name === "AbortError" && timeoutConfig.timed) {
            throw new Error(`Request to ${url} timed out after ${requestTimeout}ms`);
          }
          throw error;
        } finally {
          if (typeof timeoutConfig.cleanup === "function") {
            timeoutConfig.cleanup();
          }
        }
      });
    }
    module2.exports = { fetchWithTimeout, createTimeoutSignal };
  }
});

// src/quality_helper.js
var require_quality_helper = __commonJS({
  "src/quality_helper.js"(exports2, module2) {
    var { createTimeoutSignal } = require_fetch_helper();
    var USER_AGENT2 = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
    function checkQualityFromPlaylist(_0) {
      return __async(this, arguments, function* (url, headers = {}) {
        try {
          if (!url.includes(".m3u8")) return null;
          const finalHeaders = __spreadValues({}, headers);
          if (!finalHeaders["User-Agent"]) {
            finalHeaders["User-Agent"] = USER_AGENT2;
          }
          const timeoutConfig = createTimeoutSignal(3e3);
          try {
            const response = yield fetch(url, {
              headers: finalHeaders,
              signal: timeoutConfig.signal
            });
            if (!response.ok) return null;
            const text = yield response.text();
            const quality = checkQualityFromText2(text);
            if (quality) console.log(`[QualityHelper] Detected ${quality} from playlist: ${url}`);
            return quality;
          } finally {
            if (typeof timeoutConfig.cleanup === "function") {
              timeoutConfig.cleanup();
            }
          }
        } catch (e) {
          return null;
        }
      });
    }
    function checkQualityFromText2(text) {
      if (!text) return null;
      if (/RESOLUTION=\d+x2160/i.test(text) || /RESOLUTION=2160/i.test(text)) return "4K";
      if (/RESOLUTION=\d+x1440/i.test(text) || /RESOLUTION=1440/i.test(text)) return "1440p";
      if (/RESOLUTION=\d+x1080/i.test(text) || /RESOLUTION=1080/i.test(text)) return "1080p";
      if (/RESOLUTION=\d+x720/i.test(text) || /RESOLUTION=720/i.test(text)) return "720p";
      if (/RESOLUTION=\d+x480/i.test(text) || /RESOLUTION=480/i.test(text)) return "480p";
      return null;
    }
    function getQualityFromUrl(url) {
      if (!url) return null;
      const urlPath = url.split("?")[0].toLowerCase();
      if (urlPath.includes("4k") || urlPath.includes("2160")) return "4K";
      if (urlPath.includes("1440") || urlPath.includes("2k")) return "1440p";
      if (urlPath.includes("1080") || urlPath.includes("fhd")) return "1080p";
      if (urlPath.includes("720") || urlPath.includes("hd")) return "720p";
      if (urlPath.includes("480") || urlPath.includes("sd")) return "480p";
      if (urlPath.includes("360")) return "360p";
      return null;
    }
    module2.exports = { checkQualityFromPlaylist, getQualityFromUrl, checkQualityFromText: checkQualityFromText2 };
  }
});

// src/streamingcommunity/index.js
function getStreamingCommunityBaseUrl() {
  return "https://vixsrc.to";
}
var { formatStream } = require_formatter();
require_fetch_helper();
var { checkQualityFromText } = require_quality_helper();
function safeRequire(modulePath) {
  try {
    return require(modulePath);
  } catch (e) {
    return null;
  }
}
var guardahd = safeRequire("../guardahd/index");
var TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
var USER_AGENT = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
function getCommonHeaders() {
  return {
    "User-Agent": USER_AGENT,
    "Referer": `${getStreamingCommunityBaseUrl()}/`,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1"
  };
}
function getEmbedHeaders(embedUrl) {
  return {
    "User-Agent": USER_AGENT,
    "Referer": `${getStreamingCommunityBaseUrl()}/`,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7"
  };
}
function getPlaylistHeaders(embedUrl) {
  return {
    "User-Agent": USER_AGENT,
    "Referer": embedUrl,
    "Origin": getStreamingCommunityBaseUrl(),
    "Accept": "*/*",
    "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin"
  };
}
function extractEmbedSrcFromApiPayload(payload) {
  const rawSrc = payload && typeof payload === "object" ? payload.src : null;
  if (!rawSrc) return null;
  try {
    return new URL(rawSrc, getStreamingCommunityBaseUrl()).toString();
  } catch (e) {
    return null;
  }
}
function extractMasterPlaylistFromEmbedHtml(html) {
  if (!html) return null;
  const tokenMatch = html.match(/'token'\s*:\s*'([^']+)'/i);
  const expiresMatch = html.match(/'expires'\s*:\s*'([^']+)'/i);
  const urlMatch = html.match(/url\s*:\s*'([^']+\/playlist\/\d+[^']*)'/i);
  if (!tokenMatch || !expiresMatch || !urlMatch) {
    return null;
  }
  return {
    token: tokenMatch[1],
    expires: expiresMatch[1],
    url: urlMatch[1]
  };
}
function getQualityFromName(qualityStr) {
  if (!qualityStr) return "Auto";
  const quality = qualityStr.toUpperCase();
  if (quality === "ORG" || quality === "ORIGINAL") return "Original";
  if (quality === "4K" || quality === "2160P") return "4K";
  if (quality === "1440P" || quality === "2K") return "1440p";
  if (quality === "1080P" || quality === "FHD") return "1080p";
  if (quality === "720P" || quality === "HD") return "720p";
  if (quality === "480P" || quality === "SD") return "480p";
  if (quality === "360P") return "360p";
  if (quality === "240P") return "240p";
  const match = qualityStr.match(/(\d{3,4})[pP]?/);
  if (match) {
    const resolution = parseInt(match[1]);
    if (resolution >= 2160) return "4K";
    if (resolution >= 1440) return "1440p";
    if (resolution >= 1080) return "1080p";
    if (resolution >= 720) return "720p";
    if (resolution >= 480) return "480p";
    if (resolution >= 360) return "360p";
    return "240p";
  }
  return "Auto";
}
function getTmdbId(imdbId, type) {
  return __async(this, null, function* () {
    const normalizedType = String(type).toLowerCase();
    const findUrl = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
    try {
      const response = yield fetch(findUrl);
      if (!response.ok) return null;
      const data = yield response.json();
      if (!data) return null;
      if (normalizedType === "movie" && data.movie_results && data.movie_results.length > 0) {
        return data.movie_results[0].id.toString();
      } else if (normalizedType === "tv" && data.tv_results && data.tv_results.length > 0) {
        return data.tv_results[0].id.toString();
      }
      return null;
    } catch (e) {
      console.error("[StreamingCommunity] Conversion error:", e);
      return null;
    }
  });
}
function getMetadata(id, type) {
  return __async(this, null, function* () {
    try {
      const normalizedType = String(type).toLowerCase();
      let url;
      if (String(id).startsWith("tt")) {
        url = `https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=it-IT`;
      } else {
        const endpoint = normalizedType === "movie" ? "movie" : "tv";
        url = `https://api.themoviedb.org/3/${endpoint}/${id}?api_key=${TMDB_API_KEY}&language=it-IT`;
      }
      const response = yield fetch(url);
      if (!response.ok) return null;
      const data = yield response.json();
      if (String(id).startsWith("tt")) {
        const results = normalizedType === "movie" ? data.movie_results : data.tv_results;
        if (results && results.length > 0) return results[0];
      } else {
        return data;
      }
      return null;
    } catch (e) {
      console.error("[StreamingCommunity] Metadata error:", e);
      return null;
    }
  });
}
function hasGuardaFallbackResults(id, type, season, episode, providerContext) {
  return __async(this, null, function* () {
    const normalizedType = String(type).toLowerCase();
    const checks = [];
    if (normalizedType === "movie" && guardahd && typeof guardahd.getStreams === "function") {
      checks.push(
        guardahd.getStreams(id, normalizedType, season, episode).then((streams) => Array.isArray(streams) && streams.length > 0).catch((e) => {
          console.warn("[StreamingCommunity] GuardaHD fallback check failed:", e);
          return false;
        })
      );
    }
    if (checks.length === 0) return false;
    const results = yield Promise.all(checks);
    return results.some(Boolean);
  });
}
function getStreams(id, type, season, episode, providerContext = null) {
  return __async(this, null, function* () {
    const requestedType = String(type).toLowerCase();
    const normalizedType = requestedType === "series" ? "tv" : requestedType;
    const baseUrl = getStreamingCommunityBaseUrl();
    const commonHeaders = getCommonHeaders();
    let tmdbId = id.toString();
    let resolvedSeason = season;
    const contextTmdbId = providerContext && /^\d+$/.test(String(providerContext.tmdbId || "")) ? String(providerContext.tmdbId) : null;
    if (contextTmdbId) {
      tmdbId = contextTmdbId;
    } else if (tmdbId.startsWith("tmdb:")) {
      tmdbId = tmdbId.replace("tmdb:", "");
    } else if (tmdbId.startsWith("tt")) {
      const convertedId = yield getTmdbId(tmdbId, normalizedType);
      if (convertedId) {
        console.log(`[StreamingCommunity] Converted ${id} to TMDB ID: ${convertedId}`);
        tmdbId = convertedId;
      } else {
        console.warn(`[StreamingCommunity] Could not convert IMDb ID ${id} to TMDB ID.`);
      }
    }
    let metadata = null;
    try {
      metadata = yield getMetadata(tmdbId, type);
    } catch (e) {
      console.error("[StreamingCommunity] Error fetching metadata:", e);
    }
    const title = metadata && (metadata.title || metadata.name || metadata.original_title || metadata.original_name) ? metadata.title || metadata.name || metadata.original_title || metadata.original_name : normalizedType === "movie" ? "Film Sconosciuto" : "Serie TV";
    const displayName = normalizedType === "movie" ? title : `${title} ${resolvedSeason}x${episode}`;
    const finalDisplayName = displayName;
    let url;
    let apiUrl;
    if (normalizedType === "movie") {
      url = `${baseUrl}/movie/${tmdbId}`;
      apiUrl = `${baseUrl}/api/movie/${tmdbId}`;
    } else if (normalizedType === "tv") {
      url = `${baseUrl}/tv/${tmdbId}/${resolvedSeason}/${episode}`;
      apiUrl = `${baseUrl}/api/tv/${tmdbId}/${resolvedSeason}/${episode}`;
    } else {
      return [];
    }
    try {
      console.log(`[StreamingCommunity] Fetching API: ${apiUrl}`);
      const response = yield fetch(apiUrl, {
        headers: commonHeaders
      });
      if (!response.ok) {
        console.error(`[StreamingCommunity] Failed to fetch page: ${response.status}`);
        return [];
      }
      const apiPayload = yield response.json().catch(() => null);
      const embedUrl = extractEmbedSrcFromApiPayload(apiPayload);
      if (!embedUrl) {
        console.log("[StreamingCommunity] Could not find embed src in API payload");
        return [];
      }
      if (providerContext == null ? void 0 : providerContext.proxyUrl) {
        const rawPageUrl = url.endsWith("/") ? url : `${url}/`;
        console.log(`[StreamingCommunity] Proxy enabled, returning raw page URL: ${rawPageUrl}`);
        const result = {
          name: `VixSrc`,
          title: finalDisplayName,
          url: rawPageUrl,
          easyProxySourceUrl: rawPageUrl,
          quality: "Auto", // Explicitly set to Auto
          type: "direct",
          behaviorHints: {
            notWebReady: false
          }
        };
        return [formatStream(result, "StreamingCommunity")].filter((s) => s !== null);
      }
      console.log(`[StreamingCommunity] Fetching embed: ${embedUrl}`);
      const embedResponse = yield fetch(embedUrl, {
        headers: getEmbedHeaders(embedUrl)
      });
      if (!embedResponse.ok) {
        console.error(`[StreamingCommunity] Failed to fetch embed: ${embedResponse.status}`);
        return [];
      }
      const embedHtml = yield embedResponse.text();
      if (!embedHtml) return [];
      const masterPlaylist = extractMasterPlaylistFromEmbedHtml(embedHtml);
      if (masterPlaylist) {
        const streamUrl = `${masterPlaylist.url}?token=${encodeURIComponent(masterPlaylist.token)}&expires=${encodeURIComponent(masterPlaylist.expires)}&h=1&lang=it`;
        const streamHeaders = getPlaylistHeaders(embedUrl);
        console.log(`[StreamingCommunity] Final stream URL: ${streamUrl}`);
        
        try {
          const playlistResponse = yield fetch(streamUrl, {
            headers: streamHeaders
          });
          if (playlistResponse.ok) {
            const playlistText = yield playlistResponse.text();
            const hasItalian = /#EXT-X-MEDIA:TYPE=AUDIO.*(?:LANGUAGE="it"|LANGUAGE="ita"|NAME="Italian"|NAME="Ita")/i.test(playlistText);
            const originalLanguageItalian = metadata && (metadata.original_language === "it" || metadata.original_language === "ita");
            if (!hasItalian && !originalLanguageItalian) {
              console.log(`[StreamingCommunity] No Italian audio found. Checking fallback.`);
              const fallbackOk = yield hasGuardaFallbackResults(id, normalizedType, resolvedSeason, episode, providerContext);
              if (!fallbackOk) {
                return [];
              }
            }
          }
        } catch (e) {
          console.warn(`[StreamingCommunity] Playlist pre-check failed, continuing:`, e);
        }
        
        const result = {
          name: `VixSrc`,
          title: finalDisplayName,
          url: streamUrl,
          easyProxySourceUrl: embedUrl,
          quality: "Auto", // Explicitly set to Auto to bypass formatter resolution logic
          type: "direct",
          headers: streamHeaders,
          behaviorHints: {
            notWebReady: false
          }
        };
        return [formatStream(result, "StreamingCommunity")].filter((s) => s !== null);
      } else {
        console.log("[StreamingCommunity] Could not find playlist info in HTML");
        return [];
      }
    } catch (error) {
      console.error("[StreamingCommunity] Error:", error);
      return [];
    }
  });
}
module.exports = { getStreams };
