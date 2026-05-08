/**
 * netmirror - Built from src/netmirror/
 * Generated: 2026-05-06T09:03:07.585Z
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

// src/netmirror/constants.js
var NETMIRROR_URL = "https://net52.cc";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var PLATFORM_MAP = {
  netflix: {
    ott: "nf",
    search: "/mobile/search.php",
    post: "/mobile/post.php",
    episodes: "/mobile/episodes.php",
    playlist: "/mobile/playlist.php",
    img: "poster/v",
    epImg: "epimg/150"
  },
  primevideo: {
    ott: "pv",
    search: "/mobile/pv/search.php",
    post: "/mobile/pv/post.php",
    episodes: "/mobile/pv/episodes.php",
    playlist: "/mobile/pv/playlist.php",
    img: "pv/v",
    epImg: "pvepimg"
  },
  hotstar: {
    ott: "hs",
    search: "/mobile/hs/search.php",
    post: "/mobile/hs/post.php",
    episodes: "/mobile/hs/episodes.php",
    playlist: "/mobile/hs/playlist.php",
    img: "hs/v",
    epImg: "hsepimg"
  },
  disney: {
    ott: "hs",
    search: "/mobile/hs/search.php",
    post: "/mobile/hs/post.php",
    episodes: "/mobile/hs/episodes.php",
    playlist: "/mobile/hs/playlist.php",
    img: "hs/v",
    epImg: "hsepimg"
  }
};
var BASE_HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-IN,en-US;q=0.9,en;q=0.8",
  "Cache-Control": "max-age=0",
  "Connection": "keep-alive",
  "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Android WebView";v="144"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Android"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/144.0.7559.132 Safari/537.36 /OS.Gatu v3.0",
  "X-Requested-With": "XMLHttpRequest"
};

// src/netmirror/utils.js
var globalCookie = "";
var cookieTimestamp = 0;
var COOKIE_EXPIRY = 54e6;
function bypass() {
  return __async(this, null, function* () {
    const now = Date.now();
    if (globalCookie && now - cookieTimestamp < COOKIE_EXPIRY) {
      return globalCookie;
    }
    const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == "x" ? r : r & 3 | 8;
      return v.toString(16);
    });
    const headers = __spreadProps(__spreadValues({}, BASE_HEADERS), {
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": "https://net22.cc",
      "Referer": "https://net22.cc/verify2"
    });
    const response = yield fetch(`${NETMIRROR_URL}/verify.php`, {
      method: "POST",
      headers,
      body: `g-recaptcha-response=${uuid}`,
      redirect: "manual"
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const match = setCookie.match(/t_hash_t=([^;]+)/);
      if (match) {
        globalCookie = match[1];
        cookieTimestamp = Date.now();
        return globalCookie;
      }
    }
    throw new Error("Failed to extract t_hash_t cookie");
  });
}
function getUnixTime() {
  return Math.floor(Date.now() / 1e3);
}

// src/netmirror/index.js
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    console.log(`[NetMirror] Fetching streams for ${mediaType} ${tmdbId}`);
    try {
      const cookie = yield bypass();
      const cookies = `t_hash_t=${cookie}; hd=on`;
      const tmdbType = mediaType === "tv" ? "tv" : "movie";
      const tmdbResp = yield fetch(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_API_KEY}`);
      const tmdbData = yield tmdbResp.json();
      const title = mediaType === "tv" ? tmdbData.name : tmdbData.title;
      if (!title)
        throw new Error("Could not fetch title from TMDB");
      const platforms = ["netflix", "primevideo", "hotstar", "disney"];
      for (const platformKey of platforms) {
        const platform = PLATFORM_MAP[platformKey];
        const streams = yield fetchFromPlatform(platformKey, title, mediaType, season, episode, cookies);
        if (streams && streams.length > 0)
          return streams;
      }
      return [];
    } catch (error) {
      console.error(`[NetMirror] Error: ${error.message}`);
      return [];
    }
  });
}
function fetchFromPlatform(platformKey, title, mediaType, season, episode, cookies) {
  return __async(this, null, function* () {
    const platform = PLATFORM_MAP[platformKey];
    const searchUrl = `${NETMIRROR_URL}${platform.search}?s=${encodeURIComponent(title)}&t=${getUnixTime()}`;
    const searchResp = yield fetch(searchUrl, {
      headers: __spreadProps(__spreadValues({}, BASE_HEADERS), { Cookie: `${cookies}; ott=${platform.ott}` })
    });
    const searchData = yield searchResp.json();
    if (!searchData.searchResult || searchData.searchResult.length === 0)
      return null;
    const result = searchData.searchResult[0];
    const contentId = result.id;
    const postUrl = `${NETMIRROR_URL}${platform.post}?id=${contentId}&t=${getUnixTime()}`;
    const postResp = yield fetch(postUrl, {
      headers: __spreadProps(__spreadValues({}, BASE_HEADERS), { Cookie: `${cookies}; ott=${platform.ott}` })
    });
    const postData = yield postResp.json();
    let targetId = contentId;
    if (mediaType === "tv") {
      const episodes = yield getAllEpisodes(contentId, postData, platform, cookies);
      const targetEp = episodes.find((ep) => {
        if (!ep)
          return false;
        const s = parseInt(ep.s.replace("S", ""));
        const e = parseInt(ep.ep.replace("E", ""));
        return s === season && e === episode;
      });
      if (targetEp) {
        targetId = targetEp.id;
      } else {
        return null;
      }
    }
    const playlistUrl = `${NETMIRROR_URL}${platform.playlist}?id=${targetId}&t=${encodeURIComponent(title)}&tm=${getUnixTime()}`;
    const playlistResp = yield fetch(playlistUrl, {
      headers: __spreadProps(__spreadValues({}, BASE_HEADERS), { Cookie: `${cookies}; ott=${platform.ott}` })
    });
    const playlist = yield playlistResp.json();
    const streams = [];
    if (Array.isArray(playlist)) {
      playlist.forEach((item) => {
        if (!item.sources)
          return;
        item.sources.forEach((source) => {
          streams.push({
            name: `NetMirror (${platformKey.charAt(0).toUpperCase() + platformKey.slice(1)})`,
            title: `${title} ${source.label}`,
            url: source.file.startsWith("http") ? source.file : `${NETMIRROR_URL}${source.file.startsWith("/") ? "" : "/"}${source.file}`,
            quality: source.label,
            headers: { Referer: `${NETMIRROR_URL}/home`, Cookie: "hd=on" }
          });
        });
      });
    }
    return streams;
  });
}
function getAllEpisodes(contentId, postData, platform, cookies) {
  return __async(this, null, function* () {
    const episodes = [...postData.episodes || []].filter((e) => e !== null);
    if (postData.nextPageShow === 1 && postData.nextPageSeason) {
      const more = yield fetchEpisodesPage(contentId, postData.nextPageSeason, 2, platform, cookies);
      episodes.push(...more);
    }
    if (postData.season && postData.season.length > 1) {
      for (let i = 0; i < postData.season.length - 1; i++) {
        const season = postData.season[i];
        const more = yield fetchEpisodesPage(contentId, season.id, 1, platform, cookies);
        episodes.push(...more);
      }
    }
    return episodes;
  });
}
function fetchEpisodesPage(contentId, seasonId, page, platform, cookies) {
  return __async(this, null, function* () {
    const episodes = [];
    let pg = page;
    while (true) {
      const url = `${NETMIRROR_URL}${platform.episodes}?s=${seasonId}&series=${contentId}&t=${getUnixTime()}&page=${pg}`;
      const resp = yield fetch(url, {
        headers: __spreadProps(__spreadValues({}, BASE_HEADERS), { Cookie: `${cookies}; ott=${platform.ott}` })
      });
      const data = yield resp.json();
      if (data.episodes) {
        episodes.push(...data.episodes.filter((e) => e !== null));
      }
      if (data.nextPageShow === 0)
        break;
      pg++;
    }
    return episodes;
  });
}
module.exports = { getStreams };
