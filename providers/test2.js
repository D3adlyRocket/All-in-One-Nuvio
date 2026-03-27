"use strict";

var PROVIDER_NAME = "OnlyKDrama";
var SITE_URL = "https://onlykdrama.top";
var TMDB_URL = "https://www.themoviedb.org";
var FILEPRESS_ORIGIN = "https://pixeldrain.dev";
var DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9"
};
var STOP_WORDS = {
  a: true,
  an: true,
  and: true,
  at: true,
  by: true,
  for: true,
  from: true,
  in: true,
  of: true,
  on: true,
  the: true,
  to: true,
  tv: true
};

function mergeHeaders(base, extra) {
  var result = {};
  var key;
  for (key in base) {
    if (Object.prototype.hasOwnProperty.call(base, key)) {
      result[key] = base[key];
    }
  }
  if (!extra) {
    return result;
  }
  for (key in extra) {
    if (Object.prototype.hasOwnProperty.call(extra, key)) {
      result[key] = extra[key];
    }
  }
  return result;
}

function fetchText(url, options) {
  var request = options || {};
  request.headers = mergeHeaders(DEFAULT_HEADERS, request.headers || {});
  return fetch(url, request).then(function (response) {
    if (!response.ok) {
      throw new Error("HTTP " + response.status + " for " + url);
    }
    return response.text();
  });
}

function fetchJson(url, options) {
  var request = options || {};
  request.headers = mergeHeaders(DEFAULT_HEADERS, request.headers || {});
  return fetch(url, request).then(function (response) {
    if (!response.ok) {
      throw new Error("HTTP " + response.status + " for " + url);
    }
    return response.json();
  });
}

function decodeHtml(text) {
  if (!text) {
    return "";
  }
  return text
    .replace(/&#(\d+);/g, function (_, code) {
      return String.fromCharCode(parseInt(code, 10));
    })
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function safeDecode(text) {
  if (!text) {
    return "";
  }
  try {
    return decodeURIComponent(text);
  } catch (error) {
    return text;
  }
}

function safeEncodeUrl(url) {
  if (!url) {
    return "";
  }
  return String(url)
    .replace(/ /g, "%20")
    .replace(/\[/g, "%5B")
    .replace(/\]/g, "%5D");
}

function stripTags(text) {
  return decodeHtml((text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function normalizeText(text) {
  return decodeHtml(text || "")
    .toLowerCase()
    .replace(/&#8212;/g, " ")
    .replace(/[\u2019'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTokens(text) {
  var tokens = normalizeText(text).split(" ");
  var seen = {};
  var result = [];
  var i;
  var token;
  for (i = 0; i < tokens.length; i += 1) {
    token = tokens[i];
    if (!token || token.length < 2 || STOP_WORDS[token] || seen[token]) {
      continue;
    }
    seen[token] = true;
    result.push(token);
  }
  return result;
}

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractQuality(text) {
  var match = String(text || "").match(/\b(2160p|1440p|1080p|720p|540p|480p|360p)\b/i);
  return match ? match[1].toUpperCase() : "HD";
}

function getFirstMatch(text, patterns) {
  var i;
  var match;
  for (i = 0; i < patterns.length; i += 1) {
    match = text.match(patterns[i]);
    if (match && match[1]) {
      return stripTags(match[1]);
    }
  }
  return "";
}

function getTmdbInfo(tmdbId, mediaType) {
  var route = mediaType === "movie" ? "movie" : "tv";
  var url = TMDB_URL + "/" + route + "/" + encodeURIComponent(String(tmdbId)) + "?language=en-US";
  return fetchText(url).then(function (html) {
    var title = getFirstMatch(html, [
      /<meta property="og:title" content="([^"]+)"/i,
      /<title>([\s\S]*?)<\/title>/i,
      /"name":"([^"]+)"/i
    ]);
    var yearMatch = html.match(/<title>[\s\S]*?\b((?:19|20)\d{2})\b[\s\S]*?<\/title>/i) || html.match(/\b((?:19|20)\d{2})\b/);
    return {
      title: title.replace(/\s+\(TV Series.*$/i, "").replace(/\s+\(\d{4}\).*$/i, "").trim(),
      year: yearMatch ? yearMatch[1] : ""
    };
  });
}

function buildSearchQueries(title, year) {
  var queries = [];
  var cleaned = decodeHtml(title || "").replace(/[:\-]/g, " ").replace(/\s+/g, " ").trim();
  var map = {};
  function add(value) {
    var normalized = normalizeText(value);
    if (!normalized || map[normalized]) {
      return;
    }
    map[normalized] = true;
    queries.push(value);
  }
  add(title);
  add(cleaned);
  if (year) {
    add(title + " " + year);
    add(cleaned + " " + year);
  }
  return queries;
}

function extractCandidateUrls(html, mediaType) {
  var segment = mediaType === "movie" ? "/movies/" : "/drama/";
  var regex = /href=["'](https?:\/\/onlykdrama\.top\/[^"'#?]+)["']/gi;
  var urls = [];
  var seen = {};
  var match;
  while ((match = regex.exec(html))) {
    if (match[1].indexOf(segment) === -1 || seen[match[1]]) {
      continue;
    }
    seen[match[1]] = true;
    urls.push(match[1]);
  }
  return urls;
}

function scoreCandidateUrl(url, title, year, mediaType) {
  var score = mediaType === "movie" ? (url.indexOf("/movies/") !== -1 ? 10 : 0) : (url.indexOf("/drama/") !== -1 ? 10 : 0);
  var tokens = uniqueTokens(title);
  var normalizedUrl = normalizeText(url);
  var i;
  for (i = 0; i < tokens.length; i += 1) {
    if (normalizedUrl.indexOf(tokens[i]) !== -1) {
      score += 12;
    }
  }
  if (year && normalizedUrl.indexOf(String(year)) !== -1) {
    score += 15;
  }
  return score;
}

function collectCandidatePages(queries, mediaType, tmdbInfo, index, collected) {
  if (index >= queries.length) {
    return Promise.resolve(rankCandidatePages(collected, tmdbInfo, mediaType));
  }
  return fetchText(SITE_URL + "/?s=" + encodeURIComponent(queries[index])).then(function (html) {
    return collectCandidatePages(
      queries,
      mediaType,
      tmdbInfo,
      index + 1,
      collected.concat(extractCandidateUrls(html, mediaType))
    );
  }).catch(function () {
    return collectCandidatePages(queries, mediaType, tmdbInfo, index + 1, collected);
  });
}

function rankCandidatePages(urls, tmdbInfo, mediaType) {
  var seen = {};
  var ranked = [];
  var i;
  for (i = 0; i < urls.length; i += 1) {
    if (seen[urls[i]]) {
      continue;
    }
    seen[urls[i]] = true;
    ranked.push({
      url: urls[i],
      score: scoreCandidateUrl(urls[i], tmdbInfo.title, tmdbInfo.year, mediaType),
      index: i
    });
  }
  ranked.sort(function (a, b) {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.index - b.index;
  });
  return ranked.slice(0, 8).map(function (item) {
    return item.url;
  });
}

function getOnlyKDramaTitle(html) {
  return getFirstMatch(html, [
    /<div class="data">\s*<h1>([\s\S]*?)<\/h1>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /<meta property="og:title" content="([^"]+)"/i
  ]);
}

function titleLooksRelevant(candidateTitle, expectedTitle, expectedYear) {
  var candidateTokens = uniqueTokens(candidateTitle);
  var expectedTokens = uniqueTokens(expectedTitle);
  var matchCount = 0;
  var i;
  var tokenMap = {};
  var candidateYearMatch = String(candidateTitle || "").match(/\b((?:19|20)\d{2})\b/);
  var candidateYear = candidateYearMatch ? candidateYearMatch[1] : "";
  for (i = 0; i < candidateTokens.length; i += 1) {
    tokenMap[candidateTokens[i]] = true;
  }
  for (i = 0; i < expectedTokens.length; i += 1) {
    if (tokenMap[expectedTokens[i]]) {
      matchCount += 1;
    }
  }
  if (expectedYear && candidateYear && candidateYear !== String(expectedYear)) {
    return false;
  }
  if (expectedTokens.length <= 2) {
    return matchCount >= 1;
  }
  return matchCount >= 2;
}

function extractAttr(html, name) {
  var match = html.match(new RegExp(name + "=['\"]([^'\"]+)['\"]", "i"));
  return match ? match[1] : "";
}

function extractMovieOptions(html) {
  var regex = /<li[^>]*class=['"][^'"]*dooplay_player_option[^'"]*['"][^>]*>[\s\S]*?<\/li>/gi;
  var options = [];
  var match;
  while ((match = regex.exec(html))) {
    options.push({
      label: stripTags(match[0]),
      post: extractAttr(match[0], "data-post"),
      type: extractAttr(match[0], "data-type"),
      nume: extractAttr(match[0], "data-nume")
    });
  }
  return options;
}

function extractDirectMovieUrl(embedUrl) {
  if (!embedUrl) {
    return "";
  }
  try {
    var parsed = new URL(embedUrl);
    var source = parsed.searchParams.get("source");
    if (source) {
      return source;
    }
  } catch (error) {
    return embedUrl;
  }
  return embedUrl;
}

function buildStream(title, url, quality) {
  return {
    name: PROVIDER_NAME,
    title: title,
    url: safeEncodeUrl(url),
    quality: quality || "HD"
  };
}

function resolveMoviePage(pageUrl, html) {
  var options = extractMovieOptions(html);
  var option = null;
  var i;
  for (i = 0; i < options.length; i += 1) {
    if (/fast stream/i.test(options[i].label) && options[i].post && options[i].nume) {
      option = options[i];
      break;
    }
  }
  if (!option) {
    return Promise.resolve([]);
  }
  return fetchJson(SITE_URL + "/wp-admin/admin-ajax.php", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: pageUrl
    },
    body: new URLSearchParams({
      action: "doo_player_ajax",
      post: option.post,
      nume: option.nume,
      type: option.type || "movie"
    }).toString()
  }).then(function (payload) {
    var directUrl = extractDirectMovieUrl(payload && payload.embed_url);
    if (!directUrl) {
      return [];
    }
    return [
      buildStream("Fast Stream", directUrl, extractQuality(safeDecode(directUrl)))
    ];
  });
}

function extractEpisodeAnchors(html) {
  var regex = /<a[^>]+href=["'](https:\/\/new2\.filepress\.wiki\/file\/([A-Za-z0-9]+))["'][^>]*>([\s\S]*?)<\/a>/gi;
  var results = [];
  var seen = {};
  var match;
  while ((match = regex.exec(html))) {
    if (seen[match[2]]) {
      continue;
    }
    seen[match[2]] = true;
    results.push({
      url: match[1],
      fileId: match[2],
      text: stripTags(match[3])
    });
  }
  return results;
}

function episodeMatches(text, season, episode, hasSeasonedEntries) {
  var escapedEpisode = escapeRegex(String(episode));
  var explicitSeasonPattern = new RegExp("(?:^|[^A-Z0-9])S0*" + escapeRegex(String(season)) + "E0*" + escapedEpisode + "(?:[^A-Z0-9]|$)", "i");
  var episodePattern = new RegExp("(?:^|[^A-Z0-9])E0*" + escapedEpisode + "(?:[^A-Z0-9]|$)", "i");
  var namedEpisodePattern = new RegExp("Episode\\s*0*" + escapedEpisode + "(?:[^0-9]|$)", "i");
  if (explicitSeasonPattern.test(text)) {
    return true;
  }
  if (hasSeasonedEntries) {
    return false;
  }
  if (season > 1) {
    return false;
  }
  return episodePattern.test(text) || namedEpisodePattern.test(text);
}

function pickEpisodeAnchor(anchors, season, episode) {
  var hasSeasonedEntries = anchors.some(function (anchor) {
    return /S\d{1,2}E\d{1,2}/i.test(anchor.text);
  });
  var i;
  for (i = 0; i < anchors.length; i += 1) {
    if (episodeMatches(anchors[i].text, season, episode, hasSeasonedEntries)) {
      return anchors[i];
    }
  }
  return null;
}

function filePressHeaders(fileId) {
  return {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    Origin: FILEPRESS_ORIGIN,
    Referer: FILEPRESS_ORIGIN + "/file/" + fileId,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin"
  };
}

function extractFilePressUrl(data, method) {
  if (method === "indexDownlaod" || method === "cloudDownlaod" || method === "cloudR2Downlaod") {
    return Array.isArray(data) && data[0] ? data[0] : "";
  }
  if (method === "publicDownlaod" || method === "publicUserDownlaod") {
    return data ? "https://drive.google.com/uc?id=" + data : "";
  }
  return "";
}

function resolveFilePressWithMethod(fileId, methods, index) {
  if (index >= methods.length) {
    return Promise.resolve("");
  }
  var method = methods[index];
  var headers = filePressHeaders(fileId);
  return fetchJson(FILEPRESS_ORIGIN + "/api/file/downlaod/", {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      id: fileId,
      method: method,
      captchaValue: ""
    })
  }).then(function (firstStep) {
    if (!firstStep || !firstStep.status || !firstStep.data) {
      return resolveFilePressWithMethod(fileId, methods, index + 1);
    }
    return fetchJson(FILEPRESS_ORIGIN + "/api/file/downlaod2/", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        id: firstStep.data,
        method: method,
        captchaValue: ""
      })
    }).then(function (secondStep) {
      var finalUrl = secondStep && secondStep.status ? extractFilePressUrl(secondStep.data, method) : "";
      if (finalUrl) {
        return finalUrl;
      }
      return resolveFilePressWithMethod(fileId, methods, index + 1);
    });
  }).catch(function () {
    return resolveFilePressWithMethod(fileId, methods, index + 1);
  });
}

function resolveEpisodePage(html, season, episode) {
  var anchor = pickEpisodeAnchor(extractEpisodeAnchors(html), season, episode);
  if (!anchor) {
    return Promise.resolve([]);
  }
  return resolveFilePressWithMethod(anchor.fileId, [
    "indexDownlaod",
    "publicDownlaod",
    "publicUserDownlaod"
  ], 0).then(function (finalUrl) {
    if (!finalUrl) {
      return [];
    }
    return [
      buildStream(anchor.text || "Episode " + episode, finalUrl, extractQuality(anchor.text))
    ];
  });
}

function tryCandidatePages(urls, index, mediaType, tmdbInfo, season, episode) {
  if (index >= urls.length) {
    return Promise.resolve([]);
  }
  return fetchText(urls[index]).then(function (html) {
    var pageTitle = getOnlyKDramaTitle(html);
    if (!titleLooksRelevant(pageTitle, tmdbInfo.title, tmdbInfo.year)) {
      return tryCandidatePages(urls, index + 1, mediaType, tmdbInfo, season, episode);
    }
    return (mediaType === "movie" ? resolveMoviePage(urls[index], html) : resolveEpisodePage(html, season, episode)).then(function (streams) {
      if (streams && streams.length) {
        return streams;
      }
      return tryCandidatePages(urls, index + 1, mediaType, tmdbInfo, season, episode);
    }).catch(function () {
      return tryCandidatePages(urls, index + 1, mediaType, tmdbInfo, season, episode);
    });
  }).catch(function () {
    return tryCandidatePages(urls, index + 1, mediaType, tmdbInfo, season, episode);
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var normalizedMediaType = mediaType === "movie" ? "movie" : "tv";
  var normalizedSeason = Number(season) || 1;
  var normalizedEpisode = Number(episode) || 1;
  return getTmdbInfo(tmdbId, normalizedMediaType).then(function (tmdbInfo) {
    if (!tmdbInfo || !tmdbInfo.title) {
      return [];
    }
    return collectCandidatePages(
      buildSearchQueries(tmdbInfo.title, tmdbInfo.year),
      normalizedMediaType,
      tmdbInfo,
      0,
      []
    ).then(function (urls) {
      return tryCandidatePages(urls, 0, normalizedMediaType, tmdbInfo, normalizedSeason, normalizedEpisode);
    });
  }).catch(function (error) {
    console.log("[" + PROVIDER_NAME + "] " + error.message);
    return [];
  });
}

module.exports = {
  getStreams: getStreams
};
