// src/lamovie/index.js
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://la.movie";
var API_URL = "https://la.movie/wp-api/v1";
var ANIME_COUNTRIES = ["JP", "CN", "KR"];
var GENRE_ANIMATION = 16;
var DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};
function get(url, extraHeaders) {
  var headers = Object.assign({}, DEFAULT_HEADERS, extraHeaders || {});
  return fetch(url, { headers, redirect: "follow" }).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
    var ct = res.headers.get("content-type") || "";
    if (ct.indexOf("json") !== -1) return res.json();
    return res.text();
  });
}
function normalizeTitle(t) {
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function buildSlug(title, year) {
  var slug = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return year ? slug + "-" + year : slug;
}
function getPostTypes(mediaType, genres, originCountries) {
  if (mediaType === "movie") return ["movies"];
  var isAnimation = (genres || []).indexOf(GENRE_ANIMATION) !== -1;
  if (!isAnimation) return ["tvshows"];
  var isAnimeCountry = false;
  for (var i = 0; i < (originCountries || []).length; i++) {
    if (ANIME_COUNTRIES.indexOf(originCountries[i]) !== -1) {
      isAnimeCountry = true;
      break;
    }
  }
  return isAnimeCountry ? ["animes"] : ["animes", "tvshows"];
}
var STOPWORDS = { las: 1, los: 1, una: 1, uno: 1, del: 1, con: 1, que: 1, por: 1, para: 1, the: 1, and: 1, for: 1, from: 1, with: 1 };
function scoreCandidate(candidateTitle, tmdbTitle, originalTitle, year) {
  var normCand = normalizeTitle(candidateTitle);
  var normTmdb = normalizeTitle(tmdbTitle);
  var normOrig = normalizeTitle(originalTitle || tmdbTitle);
  var score = 0;
  if (year && normCand.indexOf(year) !== -1) score += 50;
  var wordsToCheck = normTmdb.split(" ").filter(function(w) {
    return (w.length > 3 || /^\d+$/.test(w)) && !STOPWORDS[w];
  });
  if (wordsToCheck.length > 0) {
    var matched = 0;
    for (var i = 0; i < wordsToCheck.length; i++) {
      if (normCand.indexOf(wordsToCheck[i]) !== -1) matched++;
    }
    score += matched / wordsToCheck.length * 30;
  }
  var origWords = normOrig.split(" ").filter(function(w) {
    return (w.length > 3 || /^\d+$/.test(w)) && !STOPWORDS[w];
  });
  if (origWords.length > 0) {
    var origMatched = 0;
    for (var j = 0; j < origWords.length; j++) {
      if (normCand.indexOf(origWords[j]) !== -1) origMatched++;
    }
    score += origMatched / origWords.length * 20;
  }
  var sequelNum = normTmdb.match(/\b(\d+)\s*$/);
  if (sequelNum && normCand.split(" ").indexOf(sequelNum[1]) === -1) {
    score -= 100;
  }
  return score;
}
function b64decode(str) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var result = "";
  var i = 0;
  var s = str.replace(/[^A-Za-z0-9+/]/g, "");
  while (i < s.length) {
    var a = chars.indexOf(s[i++]);
    var b = chars.indexOf(s[i++]);
    var c = i < s.length ? chars.indexOf(s[i++]) : -1;
    var d = i < s.length ? chars.indexOf(s[i++]) : -1;
    var cb = c === -1 ? 0 : c;
    var db = d === -1 ? 0 : d;
    var n = a << 18 | b << 12 | cb << 6 | db;
    result += String.fromCharCode(n >> 16 & 255);
    if (c !== -1) result += String.fromCharCode(n >> 8 & 255);
    if (d !== -1) result += String.fromCharCode(n & 255);
  }
  return result;
}
function resolveRelativeUrl(href, base) {
  if (href.indexOf("http") === 0) return href;
  var m = base.match(/^(https?:\/\/[^/]+)/);
  var origin = m ? m[1] : "";
  if (href.charAt(0) === "/") return origin + href;
  var basePath = base.substring(0, base.lastIndexOf("/") + 1);
  return basePath + href;
}
function voeDecode(ct, luts) {
  try {
    var rawLuts = luts.replace(/^\[|\]$/g, "").split("','").map(function(s) {
      return s.replace(/^'+|'+$/g, "");
    });
    var escapedLuts = rawLuts.map(function(i) {
      return i.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    });
    var txt = "";
    for (var ci = 0; ci < ct.length; ci++) {
      var x = ct.charCodeAt(ci);
      if (x > 64 && x < 91) x = (x - 52) % 26 + 65;
      else if (x > 96 && x < 123) x = (x - 84) % 26 + 97;
      txt += String.fromCharCode(x);
    }
    for (var pi = 0; pi < escapedLuts.length; pi++) txt = txt.replace(new RegExp(escapedLuts[pi], "g"), "_");
    txt = txt.split("_").join("");
    var decoded1 = b64decode(txt);
    if (!decoded1) return null;
    var step4 = "";
    for (var si = 0; si < decoded1.length; si++) step4 += String.fromCharCode((decoded1.charCodeAt(si) - 3 + 256) % 256);
    var revBase64 = step4.split("").reverse().join("");
    var finalStr = b64decode(revBase64);
    if (!finalStr) return null;
    return JSON.parse(finalStr);
  } catch (e) {
    return null;
  }
}
function resolveVoe(embedUrl) {
  return get(embedUrl, { "Referer": embedUrl }).then(function(data) {
    var rMain = data.match(/json">\s*\[s*['"]([^'"]+)['"]\s*\]\s*<\/script>\s*<script[^>]*src=['"]([^'"]+)['"]/i);
    if (rMain) {
      var encodedArray = rMain[1];
      var loaderUrl = resolveRelativeUrl(rMain[2], embedUrl);
      return get(loaderUrl, { "Referer": embedUrl }).then(function(jsData) {
        var replMatch = jsData.match(/(\[(?:'[^']{1,10}'[\s,]*){4,12}\])/i) || jsData.match(/(\[(?:"[^"]{1,10}"[,\s]*){4,12}\])/i);
        if (replMatch) {
          var decoded = voeDecode(encodedArray, replMatch[1]);
          if (decoded && (decoded.source || decoded.direct_access_url)) {
            var url2 = decoded.source || decoded.direct_access_url;
            return { url: url2, quality: "1080p", headers: { "Referer": embedUrl } };
          }
        }
        return null;
      });
    }
    var re = /(?:mp4|hls)['"\s]*:\s*['"]([^'"]+)['"]/gi;
    var m;
    while ((m = re.exec(data)) !== null) {
      var candidate = m[1];
      if (!candidate) continue;
      var url = candidate;
      if (url.indexOf("aHR0") === 0) {
        try {
          url = b64decode(url);
        } catch (e) {
        }
      }
      return { url, quality: "1080p", headers: { "Referer": embedUrl } };
    }
    return null;
  }).catch(function(err) {
    console.log("[VOE] Error: " + err.message);
    return null;
  });
}
var HLSWISH_DOMAIN_MAP = { "hglink.to": "vibuxer.com" };
function unpackEval(payload, radix, symtab) {
  var chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return payload.replace(/\b([0-9a-zA-Z]+)\b/g, function(match) {
    var result = 0;
    for (var i = 0; i < match.length; i++) {
      var pos = chars.indexOf(match[i]);
      if (pos === -1) return match;
      result = result * radix + pos;
    }
    if (isNaN(result) || result >= symtab.length) return match;
    return symtab[result] && symtab[result] !== "" ? symtab[result] : match;
  });
}
function resolveHlswish(embedUrl) {
  var fetchUrl = embedUrl;
  var keys = Object.keys(HLSWISH_DOMAIN_MAP);
  for (var ki = 0; ki < keys.length; ki++) {
    if (fetchUrl.indexOf(keys[ki]) !== -1) fetchUrl = fetchUrl.replace(keys[ki], HLSWISH_DOMAIN_MAP[keys[ki]]);
  }
  var embedHostMatch = fetchUrl.match(/^(https?:\/\/[^/]+)/);
  var embedHost = embedHostMatch ? embedHostMatch[1] : "https://hlswish.com";
  return get(fetchUrl, {
    "Referer": "https://embed69.org/",
    "Origin": "https://embed69.org",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9"
  }).then(function(data) {
    var fileMatch = data.match(/file\s*:\s*["']([^"']+)["']/i);
    if (fileMatch) {
      var url = fileMatch[1];
      if (url.charAt(0) === "/") url = embedHost + url;
      return { url, quality: "1080p", headers: { "User-Agent": DEFAULT_HEADERS["User-Agent"], "Referer": embedHost + "/" } };
    }
    var packMatch = data.match(/eval\(function\(p,a,c,k,e,[a-z]\)\{[^}]+\}\s*\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)/);
    if (packMatch) {
      var unpacked = unpackEval(packMatch[1], parseInt(packMatch[2]), packMatch[4].split("|"));
      var m3u8Match = unpacked.match(/["']([^"']{30,}\.m3u8[^"']*)['"]/);
      if (m3u8Match) {
        var url = m3u8Match[1];
        if (url.charAt(0) === "/") url = embedHost + url;
        return { url, quality: "1080p", headers: { "User-Agent": DEFAULT_HEADERS["User-Agent"], "Referer": embedHost + "/" } };
      }
    }
    var rawM3u8 = data.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
    if (rawM3u8) return { url: rawM3u8[0], quality: "1080p", headers: { "User-Agent": DEFAULT_HEADERS["User-Agent"], "Referer": embedHost + "/" } };
    return null;
  }).catch(function(err) {
    console.log("[HLSWish] Error: " + err.message);
    return null;
  });
}
function resolveVimeos(embedUrl) {
  var originMatch = embedUrl.match(/^(https?:\/\/[^/]+)/);
  var origin = originMatch ? originMatch[1] : "https://vimeos.net";
  var playHeaders = { "User-Agent": DEFAULT_HEADERS["User-Agent"], "Referer": origin + "/", "Origin": origin };
  var fetchOpts = {
    "Referer": "https://la.movie/tv/",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9"
  };
  function extractFileUrl(data) {
    var packMatch = data.match(/eval\(function\(p,a,c,k,e,[a-z]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
    if (!packMatch) return null;
    var symtab = packMatch[4].split("|");
    var unpacked = unpackEval(packMatch[1], parseInt(packMatch[2]), symtab);
    var m = unpacked.match(/file:"(https?:\/\/[^"]+\.m3u8[^"]*)"/);
    if (!m) m = unpacked.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/);
    return m ? m[1] : null;
  }
  function attempt(n) {
    return get(embedUrl, fetchOpts).then(function(data) {
      var masterUrl = extractFileUrl(data);
      if (!masterUrl) {
        console.log("[Vimeos] Intento " + n + " sin URL, reintentando...");
        return attempt(n + 1);
      }
      var iParam = (masterUrl.match(/[?&]i=([^&]*)/) || ["", "?"])[1];
      console.log("[Vimeos] Intento " + n + " i=" + iParam + ": " + masterUrl.slice(0, 100));
      if (iParam === "0.0") {
        return { url: masterUrl, quality: "1080p", headers: playHeaders };
      }
      return attempt(n + 1);
    }).catch(function(err) {
      console.log("[Vimeos] Error intento " + n + ": " + err.message);
      return attempt(n + 1);
    });
  }
  return attempt(1);
}
function getResolver(url) {
  if (url.indexOf("hlswish") !== -1 || url.indexOf("streamwish") !== -1 || url.indexOf("strwish") !== -1 || url.indexOf("vibuxer") !== -1) return resolveHlswish;
  if (url.indexOf("voe.sx") !== -1) return resolveVoe;
  if (url.indexOf("vimeos.net") !== -1) return resolveVimeos;
  return null;
}
function getServerName(url) {
  if (url.indexOf("hlswish") !== -1 || url.indexOf("streamwish") !== -1 || url.indexOf("strwish") !== -1 || url.indexOf("vibuxer") !== -1) return "StreamWish";
  if (url.indexOf("voe.sx") !== -1) return "VOE";
  if (url.indexOf("vimeos.net") !== -1) return "Vimeos";
  return "Online";
}
function getTmdbInfo(tmdbId, mediaType) {
  var type = mediaType === "movie" ? "movie" : "tv";
  var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX";
  return get(url).then(function(data) {
    var title = type === "movie" ? data.title || data.original_title : data.name || data.original_name;
    var originalTitle = type === "movie" ? data.original_title || data.title : data.original_name || data.name;
    var year = (type === "movie" ? data.release_date || "" : data.first_air_date || "").slice(0, 4);
    var genres = (data.genres || []).map(function(g) {
      return g.id;
    });
    var originCountries = data.origin_country || (data.production_countries || []).map(function(c) {
      return c.iso_3166_1;
    }) || [];
    return { title, originalTitle, year, genres, originCountries };
  });
}
function getIdBySlugApi(postType, slug) {
  var url = API_URL + "/single/" + postType + "?slug=" + encodeURIComponent(slug) + "&postType=" + postType;
  return get(url, { "Accept": "application/json", "Referer": BASE_URL + "/" }).then(function(data) {
    if (data && data.data && data.data._id) {
      console.log("[LaMovie] Slug OK: /" + postType + "/" + slug + " id:" + data.data._id);
      return { id: String(data.data._id) };
    }
    return null;
  }).catch(function() {
    return null;
  });
}
function searchLaMovie(title, originalTitle, year, postTypes) {
  var postType = postTypes.length === 1 ? postTypes[0] : "any";
  var url = API_URL + "/search?q=" + encodeURIComponent(title) + "&postType=" + postType + "&postsPerPage=10";
  return get(url, { "Accept": "application/json", "Referer": BASE_URL + "/" }).then(function(data) {
    var posts = data && data.data && data.data.posts || [];
    if (!posts.length && originalTitle && normalizeTitle(originalTitle) !== normalizeTitle(title)) {
      console.log('[LaMovie] Buscando con titulo original: "' + originalTitle + '"');
      var url2 = API_URL + "/search?q=" + encodeURIComponent(originalTitle) + "&postType=" + postType + "&postsPerPage=10";
      return get(url2, { "Accept": "application/json", "Referer": BASE_URL + "/" }).then(function(data2) {
        return data2 && data2.data && data2.data.posts || [];
      }).catch(function() {
        return [];
      });
    }
    return posts;
  }).then(function(posts) {
    if (!posts.length) return null;
    var scored = [];
    for (var i = 0; i < posts.length; i++) {
      scored.push({ post: posts[i], score: scoreCandidate(posts[i].title || "", title, originalTitle, year) });
    }
    scored.sort(function(a, b) {
      return b.score - a.score;
    });
    var best = scored[0];
    if (best.score < 20) {
      console.log("[LaMovie] Sin coincidencias (score: " + best.score.toFixed(1) + ")");
      return null;
    }
    console.log('[LaMovie] Busqueda OK: "' + best.post.title + '" (score:' + best.score.toFixed(1) + ") id:" + best.post._id);
    return { id: String(best.post._id) };
  }).catch(function(err) {
    console.log("[LaMovie] Error busqueda: " + err.message);
    return null;
  });
}
function findContent(title, originalTitle, year, mediaType, genres, originCountries) {
  var postTypes = getPostTypes(mediaType, genres, originCountries);
  var slugs = [];
  if (title) {
    slugs.push({ postType: postTypes[0], slug: buildSlug(title, year) });
    slugs.push({ postType: postTypes[0], slug: buildSlug(title, "") });
  }
  if (originalTitle && normalizeTitle(originalTitle) !== normalizeTitle(title)) {
    slugs.push({ postType: postTypes[0], slug: buildSlug(originalTitle, year) });
    slugs.push({ postType: postTypes[0], slug: buildSlug(originalTitle, "") });
  }
  if (postTypes.length > 1) {
    slugs.push({ postType: postTypes[1], slug: buildSlug(title, year) });
    slugs.push({ postType: postTypes[1], slug: buildSlug(title, "") });
  }
  function tryNextSlug(si) {
    if (si >= slugs.length) return Promise.resolve(null);
    return getIdBySlugApi(slugs[si].postType, slugs[si].slug).then(function(result) {
      if (result) return result;
      return tryNextSlug(si + 1);
    });
  }
  return tryNextSlug(0).then(function(found) {
    if (found) return found;
    console.log('[LaMovie] Slug no encontrado, buscando: "' + title + '"');
    return searchLaMovie(title, originalTitle, year, postTypes);
  });
}
function getEpisodeId(seriesId, seasonNum, episodeNum) {
  var url = API_URL + "/single/episodes/list?_id=" + seriesId + "&season=" + seasonNum + "&page=1&postsPerPage=50";
  return get(url, { "Accept": "application/json", "Referer": BASE_URL + "/" }).then(function(data) {
    if (!data || !data.data || !data.data.posts) return null;
    var posts = data.data.posts;
    for (var i = 0; i < posts.length; i++) {
      var e = posts[i];
      if (String(e.season_number) === String(seasonNum) && String(e.episode_number) === String(episodeNum)) {
        console.log("[LaMovie] Episodio S" + seasonNum + "E" + episodeNum + " id:" + e._id);
        return String(e._id);
      }
    }
    console.log("[LaMovie] Episodio S" + seasonNum + "E" + episodeNum + " no encontrado");
    return null;
  }).catch(function(err) {
    console.log("[LaMovie] Error episodios: " + err.message);
    return null;
  });
}
function processOneEmbed(embed) {
  var resolver = getResolver(embed.url);
  if (!resolver) {
    console.log("[LaMovie] Sin resolver: " + embed.url);
    return Promise.resolve(null);
  }
  return resolver(embed.url).then(function(result) {
    if (!result || !result.url) return null;
    var serverName = getServerName(embed.url);
    var qualityLabel = embed.quality || result.quality || "1080p";
    var displayQuality = serverName + " \xB7 " + qualityLabel;
    return {
      name: "LaMovie",
      title: displayQuality,
      url: result.url,
      quality: displayQuality,
      headers: result.headers || {}
    };
  }).catch(function(err) {
    console.log("[LaMovie] Error embed: " + err.message);
    return null;
  });
}
function processEmbeds(embeds) {
  var results = [];
  function next(i) {
    if (i >= embeds.length) return Promise.resolve(results);
    return processOneEmbed(embeds[i]).then(function(result) {
      if (result) results.push(result);
      return next(i + 1);
    }).catch(function() {
      return next(i + 1);
    });
  }
  return next(0);
}
function getStreams(tmdbId, mediaType, season, episode) {
  var resolvedType = mediaType === "series" ? "tv" : mediaType || "movie";
  try {
    console.log("[LaMovie] Buscando TMDB:" + tmdbId + " (" + resolvedType + ")" + (season ? " S" + season + "E" + episode : ""));
    return getTmdbInfo(tmdbId, resolvedType).then(function(info) {
      if (!info || !info.title) return [];
      console.log('[LaMovie] TMDB: "' + info.title + '" (' + info.year + ")");
      return findContent(info.title, info.originalTitle, info.year, resolvedType, info.genres, info.originCountries).then(function(found) {
        if (!found) {
          console.log("[LaMovie] No encontrado");
          return [];
        }
        var contentId = found.id;
        var targetIdPromise;
        if (resolvedType === "tv" && season && episode) {
          targetIdPromise = getEpisodeId(contentId, season, episode);
        } else {
          targetIdPromise = Promise.resolve(contentId);
        }
        return targetIdPromise.then(function(targetId) {
          if (!targetId) return [];
          var playerUrl = API_URL + "/player?postId=" + targetId + "&demo=0";
          return get(playerUrl, { "Accept": "application/json", "Referer": BASE_URL + "/" }).then(function(data) {
            if (!data || !data.data || !data.data.embeds || !data.data.embeds.length) {
              console.log("[LaMovie] Sin embeds");
              return [];
            }
            var embeds = data.data.embeds;
            console.log("[LaMovie] " + embeds.length + " embed(s)...");
            return processEmbeds(embeds);
          }).then(function(streams) {
            console.log("[LaMovie] " + streams.length + " stream(s)");
            return streams;
          });
        });
      });
    }).catch(function(err) {
      console.log("[LaMovie] Error: " + err.message);
      return [];
    });
  } catch (err) {
    console.log("[LaMovie] Error fatal: " + err.message);
    return Promise.resolve([]);
  }
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
