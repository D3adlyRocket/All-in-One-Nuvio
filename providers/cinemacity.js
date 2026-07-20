/**
 * cinemacity - Built from src/cinemacity/
 * Generated: 2026-07-20T14:03:24.965Z
 */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
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
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
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

// src/cinemacity/index.js
var import_cheerio_without_node_native = __toESM(require("cheerio-without-node-native"));

// src/cinemacity/constants.js
var MAIN_URL = "https://cinemacity.cc";
var HEADERS = {
  "Cookie": "dle_user_id=32729; dle_password=894171c6a8dab18ee594d5c652009a35;",
  "Referer": "https://cinemacity.cc/"
};
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";

// src/cinemacity/utils.js
var atobPolyfill = (str) => {
  try {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    let output = "";
    str = String(str).replace(/[=]+$/, "");
    if (str.length % 4 === 1)
      return "";
    for (let bc = 0, bs = 0, buffer, i = 0; buffer = str.charAt(i++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
      buffer = chars.indexOf(buffer);
    }
    return output;
  } catch (e) {
    return "";
  }
};
function fetchText(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    const response = yield fetch(url, __spreadValues({
      headers: options.headers || HEADERS,
      skipSizeCheck: true,
      // Critical for Nuvio not to block HTML/Metadata
      cfKiller: true
    }, options));
    if (!response.ok)
      throw new Error(`HTTP ${response.status}`);
    return yield response.text();
  });
}
function extractQuality(url) {
  const low = (url || "").toLowerCase();
  if (low.includes("2160p") || low.includes("4k"))
    return "4K";
  if (low.includes("1080p"))
    return "1080p";
  if (low.includes("720p"))
    return "720p";
  if (low.includes("480p"))
    return "480p";
  if (low.includes("360p"))
    return "360p";
  return "HD";
}
var abc = "ABCDEFGHIJKLMabcdefghijklmNOPQRSTUVWXYZnopqrstuvwxyz";
var keyStr = abc + "0123456789+/=";

// src/cinemacity/index.js
function searchMedia(searchQuery) {
  return __async(this, null, function* () {
    const searchUrl = `${MAIN_URL}/?do=search&subaction=search&search_start=0&full_search=0&story=${encodeURIComponent(searchQuery)}`;
    const searchHtml = yield fetchText(searchUrl);
    const $search = import_cheerio_without_node_native.default.load(searchHtml);
    let mediaUrl = null;
    $search("div.dar-short_item").each((i, el) => {
      if (mediaUrl)
        return;
      const anchor = $search(el).find("a").filter((idx, a) => ($search(a).attr("href") || "").includes(".html")).first();
      if (anchor.length) {
        mediaUrl = anchor.attr("href");
      }
    });
    if (!mediaUrl) {
      console.log(`[CinemaCity] Standard search returned no results, trying Ajax fallback search...`);
      let dleHash = null;
      const hashMatch = searchHtml.match(/dle_login_hash\s*=\s*'([^']+)'/);
      if (hashMatch) {
        dleHash = hashMatch[1];
      } else {
        const inputMatch = searchHtml.match(/name=["']dle_hash["']\s+value=["']([^"']+)["']/i) || searchHtml.match(/value=["']([^"']+)["']\s+name=["']dle_hash["']/i);
        if (inputMatch)
          dleHash = inputMatch[1];
      }
      if (!dleHash) {
        try {
          const homeHtml = yield fetchText(MAIN_URL);
          const homeHashMatch = homeHtml.match(/dle_login_hash\s*=\s*'([^']+)'/);
          if (homeHashMatch)
            dleHash = homeHashMatch[1];
        } catch (err) {
        }
      }
      if (dleHash) {
        try {
          const res = yield fetch(`${MAIN_URL}/engine/mods/dle_search/ajax.php`, {
            method: "POST",
            headers: {
              "X-Requested-With": "XMLHttpRequest",
              "Origin": MAIN_URL,
              "Referer": `${MAIN_URL}/`,
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            body: `story=${encodeURIComponent(searchQuery)}&dle_hash=${dleHash}&thisUrl=1`
          });
          if (res.ok) {
            const data = yield res.json();
            if (data && data.content) {
              const $ajax = import_cheerio_without_node_native.default.load(data.content);
              $ajax("div.dle-fast_item").each((i, el) => {
                if (mediaUrl)
                  return;
                const anchor = $ajax(el).find("a").filter((idx, a) => ($ajax(a).attr("href") || "").includes(".html")).first();
                if (anchor.length) {
                  mediaUrl = anchor.attr("href");
                }
              });
            }
          }
        } catch (e) {
          console.error(`[CinemaCity] Ajax search error: ${e.message}`);
        }
      }
    }
    return mediaUrl;
  });
}
function cleanTitle(title) {
  return title.replace(/[^0-9A-Za-z\s._-]/g, "").replace(/[\s_]+/g, ".").replace(/\.+/g, ".").replace(/^\.|\.$/g, "");
}
function filterSubs(subtitlesRaw, video) {
  if (!subtitlesRaw || typeof subtitlesRaw !== "string")
    return "";
  const lastSlashIdx = video.lastIndexOf("/");
  const videoFilename = lastSlashIdx !== -1 ? video.substring(lastSlashIdx + 1) : video;
  const baseName = videoFilename.split("_web-dl")[0].split("_202")[0];
  const subsList = subtitlesRaw.split(",");
  const matchingSubs = [];
  subsList.forEach((s) => {
    const match = s.trim().match(/\[(.+?)\](.+)/);
    if (match) {
      const subUrl = match[2];
      if (subUrl.includes(baseName)) {
        const pfIdx = subUrl.indexOf("/public_files/");
        if (pfIdx !== -1) {
          matchingSubs.push(subUrl.substring(pfIdx + "/public_files/".length()));
        } else {
          matchingSubs.push(subUrl);
        }
      }
    }
  });
  return matchingSubs.join(",");
}
function makeDownloadHref(base, videoPath, audioPath, subtitlePaths, name) {
  let url = base;
  url += `?action=download`;
  url += `&video=${encodeURIComponent(videoPath)}`;
  url += `&audio=${encodeURIComponent(audioPath)}`;
  if (subtitlePaths && subtitlePaths.length > 0) {
    url += `&subtitle=${encodeURIComponent(subtitlePaths)}`;
  }
  url += `&name=${encodeURIComponent(name)}`;
  return url;
}
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var _a;
    const streams = [];
    try {
      const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === "tv" ? "tv" : "movie"}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
      const tmdbRes = yield fetch(tmdbUrl, { skipSizeCheck: true });
      const tmdbData = yield tmdbRes.json();
      const imdbId = ((_a = tmdbData.external_ids) == null ? void 0 : _a.imdb_id) || tmdbData.imdb_id;
      const animeTitle = mediaType === "movie" ? tmdbData.title : tmdbData.name;
      if (!animeTitle && !imdbId)
        return [];
      const searchQuery = imdbId || animeTitle;
      console.log(`[CinemaCity] Searching for: ${searchQuery}`);
      let mediaUrl = yield searchMedia(searchQuery);
      if (!mediaUrl && imdbId && searchQuery !== animeTitle) {
        console.log(`[CinemaCity] IMDB search failed, falling back to title search: ${animeTitle}`);
        mediaUrl = yield searchMedia(animeTitle);
      }
      if (!mediaUrl) {
        console.log(`[CinemaCity] No media found for ${animeTitle}`);
        return [];
      }
      console.log(`[CinemaCity] Loading media page: ${mediaUrl}`);
      const pageHtml = yield fetchText(mediaUrl);
      const $page = import_cheerio_without_node_native.default.load(pageHtml);
      let playerConfig = null;
      $page("script").each((i, el) => {
        if (playerConfig)
          return;
        const html = $page(el).html() || "";
        if (html.includes("atob")) {
          const regex = /atob\s*\(\s*(['"])(.*?)\1\s*\)/g;
          let match;
          while ((match = regex.exec(html)) !== null) {
            try {
              const decoded = atobPolyfill(match[2]);
              if (decoded.includes("new Playerjs(")) {
                const configStr = decoded.split("new Playerjs(")[1].split(");")[0].trim();
                playerConfig = JSON.parse(configStr);
                break;
              }
            } catch (e) {
            }
          }
        }
      });
      if (!playerConfig || !playerConfig.file) {
        console.log(`[CinemaCity] Failed to extract player config`);
        return [];
      }
      let fileStr = "";
      let subtitlesStr = "";
      if (mediaType === "tv") {
        if (Array.isArray(playerConfig.file)) {
          const seasonRegex = new RegExp(`season\\s*${season}\\b`, "i");
          const sObj = playerConfig.file.find((f) => {
            const title = f.title || "";
            return seasonRegex.test(title) || title.includes(`\u0421\u0435\u0437\u043E\u043D ${season}`) || title.includes(`S${season}`);
          }) || playerConfig.file[0];
          if (sObj) {
            const episodes = sObj.folder || [];
            if (Array.isArray(episodes)) {
              const episodeRegex = new RegExp(`episode\\s*${episode}\\b`, "i");
              const eObj = episodes.find((e) => {
                const title = e.title || "";
                return episodeRegex.test(title) || title.includes(`\u0421\u0435\u0440\u0438\u044F ${episode}`) || title.includes(`E${episode}`);
              }) || episodes[0];
              if (eObj) {
                fileStr = eObj.file || "";
                subtitlesStr = eObj.subtitle || sObj.subtitle || playerConfig.subtitle || "";
              }
            }
          }
        }
      } else {
        if (Array.isArray(playerConfig.file)) {
          const fileObj = playerConfig.file.find((f) => !f.folder && f.file) || playerConfig.file[0];
          if (fileObj) {
            fileStr = fileObj.file || "";
            subtitlesStr = fileObj.subtitle || playerConfig.subtitle || "";
          }
        } else if (typeof playerConfig.file === "string") {
          fileStr = playerConfig.file;
          subtitlesStr = playerConfig.subtitle || "";
        }
      }
      if (!fileStr) {
        console.log(`[CinemaCity] No file string found for selection`);
        return [];
      }
      const parsedSubtitles = [];
      if (subtitlesStr && typeof subtitlesStr === "string") {
        subtitlesStr.split(",").forEach((entry) => {
          const match = entry.trim().match(/\[(.+?)\](https?:\/\/.+)/) || entry.trim().match(/\[(.+?)\](\/.+)/);
          if (match) {
            let subUrl = match[2];
            if (subUrl.startsWith("/")) {
              subUrl = `${MAIN_URL}${subUrl}`;
            }
            parsedSubtitles.push({
              url: subUrl,
              language: match[1],
              name: match[1],
              headers: { Referer: "https://cinemacity.cc/" }
            });
          }
        });
      }
      const addStream = (url, title, quality, subtitles) => {
        if (!url || !url.startsWith("http") || url.length < 15)
          return;
        streams.push({
          name: "CinemaCity",
          title,
          url,
          quality: quality || extractQuality(url),
          headers: __spreadProps(__spreadValues({}, HEADERS), {
            Referer: "https://cinemacity.cc/"
          }),
          subtitles: subtitles || []
        });
      };
      if (fileStr.includes(",")) {
        const parts = fileStr.split(",").map((p) => p.trim());
        const videoFiles = parts.filter((p) => p.endsWith(".mp4"));
        const audioFiles = parts.filter((p) => p.endsWith(".m4a"));
        if (audioFiles.length > 0) {
          const cleanedTitle = cleanTitle(animeTitle);
          audioFiles.forEach((audio, audioIndex) => {
            const lastUnderAudio = audio.lastIndexOf("_");
            const filenamePartAudio = lastUnderAudio !== -1 ? audio.substring(lastUnderAudio + 1) : audio;
            const langRaw = filenamePartAudio.split(".m4a")[0];
            let lang = langRaw.replace(/-/g, " ");
            if (lang.length > 0) {
              lang = lang.charAt(0).toUpperCase() + lang.slice(1);
            }
            videoFiles.forEach((video) => {
              const lastUnderVideo = video.lastIndexOf("_");
              const filenamePartVideo = lastUnderVideo !== -1 ? video.substring(lastUnderVideo + 1) : video;
              const res = filenamePartVideo.split(".mp4")[0];
              const quality = extractQuality(video);
              let dlName = "";
              if (mediaType === "tv") {
                const s = String(season).padStart(2, "0");
                const e = String(episode).padStart(2, "0");
                dlName = `${cleanedTitle}.S${s}E${e}.${res}.${lang.replace(/\s+/g, ".")}`;
              } else {
                dlName = `${cleanedTitle}.WEB-DL.${res}.${lang.replace(/\s+/g, ".")}`;
              }
              const subs = filterSubs(subtitlesStr, video);
              const muxedUrl = makeDownloadHref(fileStr, video, audio, subs, dlName);
              addStream(muxedUrl, `${animeTitle} (${lang})`, quality, parsedSubtitles);
            });
          });
        } else {
          videoFiles.forEach((video) => {
            addStream(video, animeTitle, extractQuality(video), parsedSubtitles);
          });
        }
      } else {
        if (fileStr.includes(".urlset/master.m3u8")) {
          addStream(fileStr, animeTitle, "Auto", parsedSubtitles);
        } else {
          addStream(fileStr, animeTitle, extractQuality(fileStr), parsedSubtitles);
        }
      }
      console.log(`[CinemaCity] Successfully processed ${streams.length} streams`);
      return streams;
    } catch (error) {
      console.error(`[CinemaCity] Error in getStreams: ${error.message}`);
      return [];
    }
  });
}
module.exports = { getStreams };
