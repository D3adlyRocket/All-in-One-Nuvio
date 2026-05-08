/**
 * 4khdhub - Built from src/4khdhub/
 * Generated: 2026-05-03T21:33:16.718Z
 */
"use strict";
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

// src/4khdhub/constants.js
var BASE_URL = "https://4khdhub.click";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
var DOMAINS_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json";

// src/4khdhub/utils.js
var domainCache = { url: BASE_URL, ts: 0 };
function fetchLatestDomain() {
  return __async(this, null, function* () {
    const now = Date.now();
    if (now - domainCache.ts < 36e5) return domainCache.url;
    try {
      const response = yield fetch(DOMAINS_URL);
      const data = yield response.json();
      if (data && data["4khdhub"]) {
        domainCache.url = data["4khdhub"];
        domainCache.ts = now;
      }
    } catch (e) {}
    return domainCache.url;
  });
}

// src/4khdhub/http.js
function fetchText(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    try {
      const response = yield fetch(url, {
        headers: __spreadValues({
          "User-Agent": USER_AGENT
        }, options.headers)
      });
      return yield response.text();
    } catch (err) {
      console.log(`[4KHDHub] Request failed for ${url}: ${err.message}`);
      return null;
    }
  });
}

// src/4khdhub/tmdb.js
function getTmdbDetails(tmdbId, type) {
  return __async(this, null, function* () {
    const isSeries = type === "series" || type === "tv";
    const endpoint = isSeries ? "tv" : "movie";
    const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    console.log(`[4KHDHub] Fetching TMDB details from: ${url}`);
    try {
      const response = yield fetch(url);
      const data = yield response.json();
      if (isSeries) {
        return {
          title: data.name,
          year: data.first_air_date ? parseInt(data.first_air_date.split("-")[0]) : 0
        };
      } else {
        return {
          title: data.title,
          year: data.release_date ? parseInt(data.release_date.split("-")[0]) : 0
        };
      }
    } catch (error) {
      console.log(`[4KHDHub] TMDB request failed: ${error.message}`);
      return null;
    }
  });
}

// src/4khdhub/utils.js
function atob(input) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let str = String(input).replace(/=+$/, "");
  if (str.length % 4 === 1) {
    throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
  }
  let output = "";
  for (let bc = 0, bs, buffer, i = 0; buffer = str.charAt(i++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
    buffer = chars.indexOf(buffer);
  }
  return output;
}
function rot13Cipher(str) {
  return str.replace(/[a-zA-Z]/g, function(c) {
    return String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
  });
}
function levenshteinDistance(s, t) {
  if (s === t)
    return 0;
  const n = s.length;
  const m = t.length;
  if (n === 0)
    return m;
  if (m === 0)
    return n;
  const d = [];
  for (let i = 0; i <= n; i++) {
    d[i] = [];
    d[i][0] = i;
  }
  for (let j = 0; j <= m; j++) {
    d[0][j] = j;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[n][m];
}
function parseBytes(val) {
  if (typeof val === "number")
    return val;
  if (!val)
    return 0;
  const match = val.match(/^([0-9.]+)\s*([a-zA-Z]+)$/);
  if (!match)
    return 0;
  const num = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  let multiplier = 1;
  if (unit.indexOf("k") === 0)
    multiplier = 1024;
  else if (unit.indexOf("m") === 0)
    multiplier = 1024 * 1024;
  else if (unit.indexOf("g") === 0)
    multiplier = 1024 * 1024 * 1024;
  else if (unit.indexOf("t") === 0)
    multiplier = 1024 * 1024 * 1024 * 1024;
  return num * multiplier;
}
function formatBytes(val) {
  if (val === 0)
    return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  let i = Math.floor(Math.log(val) / Math.log(k));
  if (i < 0)
    i = 0;
  return parseFloat((val / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// src/4khdhub/search.js
var cheerio = require("cheerio-without-node-native");
function fetchPageUrl(name, year, isSeries) {
  return __async(this, null, function* () {
    const domain = yield fetchLatestDomain();
    const searchQuery = name + (year ? " " + year : "");
    const searchUrl = `${domain}/?s=${encodeURIComponent(searchQuery)}`;
    console.log(`[4KHDHub] Search Request URL: ${searchUrl}`);
    const html = yield fetchText(searchUrl);
    if (!html) {
      console.log("[4KHDHub] Search failed: No HTML response");
      return null;
    }
    const $ = cheerio.load(html);
    const targetType = isSeries ? "Series" : "Movies";
    console.log(`[4KHDHub] Parsing search results for type: ${targetType}`);
    const candidates = $("a.movie-card").map((_, el) => {
      const cardText = $(el).text();
      const cardTitle = $(el).find("h3").text().trim() || ($(el).attr("aria-label") || "").replace(/\s+details$/i, "").trim();
      const yearText = $(el).find("p").text().trim();
      const movieCardYear = parseInt((yearText.match(/(\d{4})/) || [0])[0], 10) || 0;
      const isSeriesCard = /\bSeries\b/i.test(cardText);
      if (isSeries && !isSeriesCard) return null;
      if (!isSeries && isSeriesCard) return null;
      const yearDistance = movieCardYear === 0 || !year ? 0 : Math.abs(movieCardYear - year);
      if (movieCardYear !== 0 && year && yearDistance > 1) {
        console.log(`[4KHDHub] Skip: Year mismatch (${movieCardYear} vs ${year}) - ${cardTitle}`);
        return null;
      }
      const cleanedTitle = cardTitle.replace(/\[.*?]/g, "").trim();
      const distance = levenshteinDistance(cleanedTitle.toLowerCase(), name.toLowerCase());
      const titleMatch = cleanedTitle.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(cleanedTitle.toLowerCase()) || distance < 6;
      console.log(`[4KHDHub] Checking: "${cleanedTitle}" (Dist: ${distance}) vs "${name}"`);
      if (!titleMatch) return null;
      let href = $(el).attr("href");
      if (href && !href.startsWith("http")) {
        href = domain + (href.startsWith("/") ? "" : "/") + href;
      }
      return { href, distance, yearDistance, title: cleanedTitle };
    }).get().filter((candidate) => candidate && candidate.href);
    if (candidates.length === 0) {
      console.log("[4KHDHub] No matching cards found after filtering");
      return null;
    }
    const matchingCards = candidates.sort((a, b) => a.distance - b.distance || a.yearDistance - b.yearDistance);
    console.log(`[4KHDHub] Found ${matchingCards.length} matching cards, best match: ${matchingCards[0].title}`);
    return matchingCards[0].href;
  });
}

// src/4khdhub/extractor.js
var cheerio2 = require("cheerio-without-node-native");
function resolveRedirectUrl(redirectUrl) {
  return __async(this, null, function* () {
    if (!redirectUrl) {
      console.log("[4KHDHub] No redirect URL provided");
      return null;
    }
    
    const redirectHtml = yield fetchText(redirectUrl);
    if (!redirectHtml) {
      console.log("[4KHDHub] Failed to fetch redirect HTML");
      return redirectUrl; // Return the original URL as fallback
    }
    
    try {
      // Try multiple patterns for extracting the encoded data
      const patterns = [
        /'o','(.*?)'/,
        /['"]o['"],\s*['"]([^'"]+)['"]/,
        /'o'\s*:\s*'([^']+)'/,
        /window\.atob\(['"]([^'"]+)['"]\)/,
        /var\s+o\s*=\s*['"]([^'"]+)['"]/
      ];
      
      let redirectDataMatch = null;
      for (const pattern of patterns) {
        redirectDataMatch = redirectHtml.match(pattern);
        if (redirectDataMatch) {
          console.log(`[4KHDHub] Matched pattern: ${pattern}`);
          break;
        }
      }
      
      if (!redirectDataMatch || !redirectDataMatch[1]) {
        console.log("[4KHDHub] No redirect data pattern matched, trying direct URL extraction");
        // Try to find any redirect URL in script tags
        const scriptMatch = redirectHtml.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (scriptMatch && scriptMatch[1]) {
          return scriptMatch[1];
        }
        return redirectUrl;
      }
      
      const step1 = atob(redirectDataMatch[1]);
      const step2 = atob(step1);
      const step3 = rot13Cipher(step2);
      const step4 = atob(step3);
      const redirectData = JSON.parse(step4);
      
      if (redirectData && redirectData.o) {
        const finalUrl = atob(redirectData.o);
        console.log(`[4KHDHub] Successfully resolved redirect URL`);
        return finalUrl;
      }
      
      console.log("[4KHDHub] No 'o' property in redirect data");
      return redirectUrl;
    } catch (e) {
      console.log(`[4KHDHub] Error resolving redirect: ${e.message}`);
      return redirectUrl;
    }
  });
}
function extractSourceResults($, el) {
  return __async(this, null, function* () {
    const localHtml = $(el).html();
    if (!localHtml) {
      console.log("[4KHDHub] Warning: No HTML found for element");
      return null;
    }
    
    const sizeMatch = localHtml.match(/([\d.]+ ?[GM]B)/);
    const heightMatch = localHtml.match(/\d{3,}p/);
    const title = $(el).find(".file-title, .episode-file-title, .file-name, span").text().trim();
    
    let height = heightMatch ? parseInt(heightMatch[0]) : 0;
    if (height === 0 && (title.includes("4K") || title.includes("4k") || localHtml.includes("4K") || localHtml.includes("4k"))) {
      height = 2160;
    }
    
    const meta = {
      bytes: sizeMatch ? parseBytes(sizeMatch[1]) : 0,
      height,
      title: title || "Download"
    };
    
    console.log(`[4KHDHub] Extracting from element with meta: ${JSON.stringify(meta)}`);
    
    // Try to find HubCloud link
    let hubCloudLink = $(el).find("a").filter((_, a) => {
      const text = $(a).text();
      return text.includes("HubCloud") || text.includes("hubcloud");
    }).attr("href");
    
    if (hubCloudLink) {
      console.log(`[4KHDHub] Found HubCloud link: ${hubCloudLink}`);
      const resolved = yield resolveRedirectUrl(hubCloudLink);
      if (resolved) {
        return { url: resolved, meta };
      }
    }
    
    // Try to find HubDrive link
    let hubDriveLink = $(el).find("a").filter((_, a) => {
      const text = $(a).text();
      return text.includes("HubDrive") || text.includes("hubdrive");
    }).attr("href");
    
    if (hubDriveLink) {
      console.log(`[4KHDHub] Found HubDrive link: ${hubDriveLink}`);
      const resolvedDrive = yield resolveRedirectUrl(hubDriveLink);
      const driveUrl = resolvedDrive || hubDriveLink;
      if (driveUrl) {
        const hubDriveHtml = yield fetchText(driveUrl);
        if (hubDriveHtml) {
          const $2 = cheerio2.load(hubDriveHtml);
          const innerCloudLink = $2('a').filter((_, a) => {
            const href = $2(a).attr("href") || "";
            const text = $2(a).text().toLowerCase();
            return text.includes("hubcloud") || href.includes("hubcloud");
          }).attr("href");
          if (innerCloudLink) {
            return { url: innerCloudLink, meta };
          }
          const anySupportedLink = $2('a[href]').filter((_, a) => {
            const href = $2(a).attr("href") || "";
            return href.includes("hubcloud") || href.includes("hubdrive") || href.includes("pixeldrain") || href.includes("drive.google.com");
          }).attr("href");
          if (anySupportedLink) {
            return { url: anySupportedLink, meta };
          }
        }
        return { url: driveUrl, meta };
      }
    }
    
    // Fallback: try any link with common hosting services
    const fallbackLink = $(el).find("a[href]").filter((_, a) => {
      const href = $(a).attr("href");
      return href && (href.includes("hubcloud") || href.includes("hubdrive") || href.includes("pixeldrain"));
    }).attr("href");
    
    if (fallbackLink) {
      console.log(`[4KHDHub] Using fallback link: ${fallbackLink}`);
      return { url: fallbackLink, meta };
    }
    
    console.log("[4KHDHub] No viable links found in element");
    return null;
  });
}
function extractHubCloud(hubCloudUrl, baseMeta) {
  return __async(this, null, function* () {
    if (!hubCloudUrl) {
      console.log("[4KHDHub] No HubCloud URL provided");
      return [];
    }
    
    console.log(`[4KHDHub] Extracting from HubCloud: ${hubCloudUrl}`);
    
    const redirectHtml = yield fetchText(hubCloudUrl, { headers: { Referer: hubCloudUrl } });
    if (!redirectHtml) {
      console.log("[4KHDHub] Failed to fetch HubCloud page");
      return [];
    }
    
    // Try multiple patterns for finding the URL
    const urlPatterns = [
      /var\s+url\s*=\s*'([^']+)'/,
      /var\s+url\s*=\s*"([^"]+)"/,
      /'url'\s*:\s*'([^']+)'/,
      /window\.location\.href\s*=\s*'([^']+)'/,
      /<iframe[^>]+src=['"]([^'"]+)['"]/
    ];
    
    let finalLinksUrl = null;
    for (const pattern of urlPatterns) {
      const match = redirectHtml.match(pattern);
      if (match && match[1]) {
        finalLinksUrl = match[1];
        console.log(`[4KHDHub] Found URL with pattern: ${pattern}`);
        break;
      }
    }
    
    if (!finalLinksUrl) {
      console.log("[4KHDHub] Could not find final links URL");
      return [];
    }
    
    const linksHtml = yield fetchText(finalLinksUrl, { headers: { Referer: hubCloudUrl } });
    if (!linksHtml) {
      console.log("[4KHDHub] Failed to fetch final links page");
      return [];
    }
    
    const $ = cheerio2.load(linksHtml);
    const results = [];
    
    const sizeText = $("#size, #file-size, span[id*='size']").text();
    const titleText = $("title").text().trim();
    
    const currentMeta = __spreadProps(__spreadValues({}, baseMeta), {
      bytes: parseBytes(sizeText) || baseMeta.bytes,
      title: titleText || baseMeta.title
    });
    
    console.log(`[4KHDHub] HubCloud meta: ${JSON.stringify(currentMeta)}`);
    
    // Find all download links
    $("a").each((_, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr("href");
      
      if (!href) return;
      
      // FSL links
      if (text.includes("FSL") || text.includes("Download File") || text.toLowerCase().includes("download")) {
        console.log(`[4KHDHub] Found FSL link: ${text}`);
        results.push({
          source: "FSL",
          url: href,
          meta: currentMeta
        });
      }
      // PixelServer links
      else if (text.includes("PixelServer") || text.toLowerCase().includes("pixeldrain") || href.includes("pixeldrain")) {
        const pixelUrl = href.replace("/u/", "/api/file/");
        console.log(`[4KHDHub] Found PixelServer link: ${text}`);
        results.push({
          source: "PixelServer",
          url: pixelUrl,
          meta: currentMeta
        });
      }
      // Direct links
      else if (href.includes("http") && (text.toLowerCase().includes("link") || text.toLowerCase().includes("download") || href.includes("cdn") || href.includes("stream"))) {
        console.log(`[4KHDHub] Found direct link: ${text}`);
        results.push({
          source: "Direct",
          url: href,
          meta: currentMeta
        });
      }
    });
    
    console.log(`[4KHDHub] Extracted ${results.length} links from HubCloud`);
    return results;
  });
}

// src/4khdhub/index.js
var cheerio3 = require("cheerio-without-node-native");
function getStreams(tmdbId, type, season, episode) {
  return __async(this, null, function* () {
    try {
      console.log(`[4KHDHub] Starting extraction for TMDB ID: ${tmdbId}, Type: ${type}, Season: ${season}, Episode: ${episode}`);
      
      const tmdbDetails = yield getTmdbDetails(tmdbId, type);
      if (!tmdbDetails) {
        console.log("[4KHDHub] Failed to get TMDB details");
        return [];
      }
      
      const { title, year } = tmdbDetails;
      console.log(`[4KHDHub] Search: ${title} (${year})`);
      
      const isSeries = type === "series" || type === "tv";
      const pageUrl = yield fetchPageUrl(title, year, isSeries);
      if (!pageUrl) {
        console.log("[4KHDHub] Page not found");
        return [];
      }
      
      console.log(`[4KHDHub] Found page: ${pageUrl}`);
      
      const html = yield fetchText(pageUrl);
      if (!html) {
        console.log("[4KHDHub] Failed to fetch page HTML");
        return [];
      }
      
      const $ = cheerio3.load(html);
      const itemsToProcess = [];
      
      if (isSeries && season && episode) {
        const seasonStr = "S" + String(season).padStart(2, "0");
        const episodePadded = String(episode).padStart(2, "0");
        const episodeCode = `S${seasonStr.slice(1)}E${episodePadded}`;
        const seasonPattern = new RegExp(`\bS0?${season}\b`, "i");
        const episodePattern = new RegExp(`(?:${episodeCode}|Episode[-_ ]?${episodePadded}|\bE${episodePadded}\b)`, "i");
        
        console.log(`[4KHDHub] Looking for season ${seasonStr}, episode ${episodePadded}`);
        
        $(".season-item.episode-item, .episode-item").each((_, el) => {
          const headerText = $(el).find(".episode-title, .episode-info, .episode-header, .episode-number").text();
          if (!seasonPattern.test(headerText)) {
            return;
          }
          const downloadItems = $(el).find(".episode-download-item").filter((_2, item) => {
            const titleText = $(item).find(".episode-file-title, .file-title, .episode-title").text() || $(item).text();
            return episodePattern.test(titleText);
          });
          downloadItems.each((_2, item) => {
            itemsToProcess.push(item);
          });
        });

        if (itemsToProcess.length === 0) {
          const fallbackItems = $(".episode-download-item").filter((_2, item) => {
            const titleText = $(item).find(".episode-file-title, .file-title, .episode-title").text() || $(item).text();
            return episodePattern.test(titleText);
          });
          fallbackItems.each((_2, item) => {
            itemsToProcess.push(item);
          });
        }
      } else {
        console.log("[4KHDHub] Looking for movie download items");
        
        // Try multiple selectors for download items
        $(".download-item, .file-item, .movie-file, [class*='download'], [class*='file']").each((_, el) => {
          const hasLink = $(el).find("a[href]").length > 0;
          if (hasLink) {
            itemsToProcess.push(el);
          }
        });
      }
      
      console.log(`[4KHDHub] Processing ${itemsToProcess.length} items`);
      
      if (itemsToProcess.length === 0) {
        console.log("[4KHDHub] No download items found on page");
        return [];
      }
      
      const streamPromises = itemsToProcess.map((item) => __async(this, null, function* () {
        try {
          const sourceResult = yield extractSourceResults($, item);
          if (sourceResult && sourceResult.url) {
            console.log(`[4KHDHub] Extracting from: ${sourceResult.url}`);
            const extractedLinks = yield extractHubCloud(sourceResult.url, sourceResult.meta);
            return extractedLinks.map((link) => ({
              name: `4KHDHub - ${link.source}${sourceResult.meta.height ? ` ${sourceResult.meta.height}p` : ""}`,
              title: `${link.meta.title}
${formatBytes(link.meta.bytes || 0)}`,
              url: link.url,
              quality: sourceResult.meta.height ? `${sourceResult.meta.height}p` : void 0,
              behaviorHints: {
                bingeGroup: `4khdhub-${link.source}`
              }
            }));
          }
          return [];
        } catch (err) {
          console.log(`[4KHDHub] Item processing error: ${err.message}`);
          return [];
        }
      }));
      
      const results = yield Promise.all(streamPromises);
      const flattened = results.reduce((acc, val) => acc.concat(val), []);
      console.log(`[4KHDHub] Found ${flattened.length} total streams`);
      return flattened;
    } catch (err) {
      console.log(`[4KHDHub] Fatal error: ${err.message}`);
      return [];
    }
  });
}
module.exports = { getStreams };
